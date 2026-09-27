/* Browser-only diagnostics of the deployed public MA Grafik application.
   Never logs credentials, local storage, or personal schedule records. */
const fs = require('fs');
const { chromium, webkit, devices } = require('playwright');
const path = require('path');
const OUT = path.join(process.cwd(), 'live-browser-results');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'https://grafik-umber.vercel.app/';
const MIRROR = 'https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-grafik-mirror/';
const checks = [
  { name: 'desktop-chromium-primary', engine: chromium, url: BASE, options: {viewport:{width:1365,height:900}}, kind:'main' },
  { name: 'iphone-webkit-primary', engine: webkit, url: BASE, options: devices['iPhone 14'], kind:'main' },
  { name: 'desktop-chromium-lite', engine: chromium, url: BASE+'lite.html', options: {viewport:{width:1365,height:900}}, kind:'lite' },
  { name: 'iphone-webkit-lite', engine: webkit, url: BASE+'lite.html', options: devices['iPhone 14'], kind:'lite' }
];
async function probe(check) {
  const issues = [];
  const engine = await check.engine.launch({headless:true});
  const ctx = await engine.newContext(check.options);
  const page = await ctx.newPage();
  page.on('pageerror', e => issues.push('pageerror: '+String(e.message).slice(0,200)));
  page.on('console', msg => {if(msg.type()==='error')issues.push('console: '+String(msg.text()).slice(0,200))});
  page.on('requestfailed',req=>issues.push('requestfailed: '+new URL(req.url()).pathname+' '+(req.failure()?.errorText||'')));
  page.on('response',response=>{if(response.status()>=400)issues.push('http '+response.status()+': '+new URL(response.url()).pathname)});
  let navigationStatus=null,navigationError='',data=null;
  try {
    const response=await page.goto(check.url,{waitUntil:'domcontentloaded',timeout:25000});
    navigationStatus=response&&response.status();
    await page.waitForTimeout(check.kind==='main'?11500:7000);
    data=await page.evaluate(()=>{
      const boot=document.getElementById('appBootScreen');
      const lite=document.getElementById('status');
      return {
        title:document.title,
        url:location.href,
        booting:document.body.classList.contains('app-booting'),
        bootText:boot?.innerText?.slice(0,280)||'',
        recovery:!!document.getElementById('maBootRecovery'),
        liteStatus:lite?.textContent?.slice(0,200)||'',
        visibleContent:document.body.innerText.slice(0,380),
        loadedScripts:document.scripts.length
      };
    });
  } catch(e){ navigationError=String(e.message).slice(0,500) }
  try{await page.screenshot({path:path.join(OUT,check.name+'.png'),fullPage:true,timeout:10000})}
  catch(e){issues.push('screenshot: '+String(e.message).slice(0,120))}
  const pass=check.kind==='main'
    ? !!data&&data.title==='MA График'&&!data.booting&&!data.recovery&&data.loadedScripts>=14&&navigationStatus===200&&!issues.some(s=>s.startsWith('pageerror'))
    : !!data&&data.title.includes('МА График')&&navigationStatus===200&&data.loadedScripts>=1&&!data.visibleContent.startsWith('<!doctype html>')&&!/Не удалось получить график|Не удалось рассчитать/.test(data.liteStatus+data.visibleContent);
  const safe={
    check:check.name,passed:pass,status:navigationStatus,
    navigationError,data,issues:issues.slice(0,18)
  };
  fs.writeFileSync(path.join(OUT,check.name+'.json'),JSON.stringify(safe,null,2));
  console.log('LIVE_BROWSER_RESULT '+JSON.stringify(safe));
  await ctx.close();await engine.close();
  return safe;
}
(async()=>{
 let bad=0;
 for(const check of checks){
  try{const result=await probe(check);if(!result.passed)bad++}
  catch(e){bad++;console.log('LIVE_BROWSER_RESULT '+JSON.stringify({check:check.name,passed:false,fatal:String(e)}))}
 }
 console.log('LIVE_BROWSER_SUMMARY '+JSON.stringify({total:checks.length,failed:bad}));
 if(bad)process.exitCode=1;
})().catch(e=>{console.error(String(e));process.exitCode=1});
