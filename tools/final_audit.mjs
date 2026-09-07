import { chromium } from 'playwright';

const LOCAL = 'http://127.0.0.1:4173/';
const PROD = 'https://grafik-umber.vercel.app/';

function fail(message){ throw new Error(message); }
async function visible(page, selector){
  const el=page.locator(selector);
  if(await el.count()===0) return false;
  return await el.first().isVisible().catch(()=>false);
}

async function auditPage(browser,{name,url,viewport,offlineCycle=false,expectOnboarding=false}){
  const context=await browser.newContext({viewport, locale:'ru-RU', timezoneId:'Europe/Moscow'});
  const page=await context.newPage();
  const pageErrors=[];
  const consoleErrors=[];
  const badResponses=[];
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  page.on('console',msg=>{ if(msg.type()==='error') consoleErrors.push(msg.text()); });
  page.on('response',res=>{
    const u=res.url();
    if(u.startsWith(url) && res.status()>=400) badResponses.push(`${res.status()} ${u}`);
  });

  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  if(!response || response.status()>=400) fail(`${name}: стартовая страница HTTP ${response?.status()}`);
  await page.waitForTimeout(5000);

  const title=await page.title();
  if(!title.includes('MA График')) fail(`${name}: неверный title: ${title}`);
  if(pageErrors.length) fail(`${name}: pageerror: ${pageErrors.join(' | ')}`);
  if(badResponses.length) fail(`${name}: локальные ресурсы с ошибкой: ${badResponses.join(' | ')}`);
  const booting=await page.locator('body').evaluate(el=>el.classList.contains('app-booting'));
  if(booting){
    const scripts=await page.evaluate(()=>Array.from(document.scripts).map(s=>({src:s.src,loaded:!!s.src})));
    fail(`${name}: приложение осталось на экране загрузки; console=${consoleErrors.join(' | ')||'none'}; scripts=${JSON.stringify(scripts)}`);
  }
  const bodyText=await page.locator('body').innerText();
  if(bodyText.includes('Ошибка запуска')) fail(`${name}: показана «Ошибка запуска»`);
  if(!(await visible(page,'#adminBtn'))) fail(`${name}: кнопка администратора не видна`);
  if(!(await page.locator('#monthTitle').count())) fail(`${name}: нет заголовка месяца`);
  if(!(await page.locator('#servicesRoot').count())) fail(`${name}: нет контейнера графика`);
  if(expectOnboarding && !(await visible(page,'#employeePickerModal'))) fail(`${name}: на чистом мобильном устройстве не открылся выбор сотрудника`);

  const rootOverflow=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:window.innerWidth}));
  if(rootOverflow.w>rootOverflow.v+6) fail(`${name}: корневая горизонтальная прокрутка ${rootOverflow.w}px при viewport ${rootOverflow.v}px`);

  if(offlineCycle){
    await context.setOffline(true);
    await page.waitForTimeout(500);
    const bannerVisible=await visible(page,'#connectionBanner');

    if(!(await visible(page,'#nextBtn')) && await visible(page,'#bottomTab2')){
      await page.locator('#bottomTab2').click();
      await page.waitForTimeout(250);
    }

    if(await visible(page,'#nextBtn')){
      const before=(await page.locator('#monthTitle').textContent())||'';
      await page.locator('#nextBtn').click();
      await page.waitForTimeout(300);
      const after=(await page.locator('#monthTitle').textContent())||'';
      if(before===after) fail(`${name}: график не переключает месяц без сети`);
      await page.locator('#prevBtn').click();
    }

    await context.setOffline(false);
    await page.waitForTimeout(500);
    if(!bannerVisible) console.log(`WARN ${name}: offline banner не стал видимым за 500мс`);
    if(pageErrors.length) fail(`${name}: ошибка после offline/online: ${pageErrors.join(' | ')}`);
  }

  const sw=await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator)) return {supported:false,count:0};
    const regs=await navigator.serviceWorker.getRegistrations();
    return {supported:true,count:regs.length};
  }).catch(()=>({supported:false,count:0}));

  console.log(`PASS ${name}: ${viewport.width}x${viewport.height}, SW=${sw.supported?'yes':'no'}/${sw.count}, consoleErrors=${consoleErrors.length}`);
  await context.close();
}

const browser=await chromium.launch({headless:true});
try{
  await auditPage(browser,{name:'local desktop',url:LOCAL,viewport:{width:1440,height:900},offlineCycle:true});
  await auditPage(browser,{name:'local iPhone',url:LOCAL,viewport:{width:390,height:844},expectOnboarding:true});
  await auditPage(browser,{name:'production desktop',url:PROD,viewport:{width:1440,height:900}});
  await auditPage(browser,{name:'production iPhone',url:PROD,viewport:{width:390,height:844},expectOnboarding:true});
  console.log('FINAL_BROWSER_AUDIT_OK');
} finally {
  await browser.close();
}
