const { test, expect } = require('@playwright/test');

const SUPABASE_FUNCTIONS = 'https://yedzfmibceboncrytbqz.supabase.co/functions/v1/';

const repair = {
  id: 'perf-order-1', order_no: 9001, customer_id: 'perf-customer-1', service: 'Моба',
  device: 'Телефон', model: 'iPhone 13', imei: '123456789012345', issue: 'Тест скорости',
  comment: '', estimated_price: 5000, final_price: 5000, manager: 'Администратор', master: 'Асик',
  status: 'in_work', accepted_at: '2026-09-13T08:00:00.000Z', updated_at: '2026-09-13T08:00:00.000Z',
  due_at: null, warranty_days: 14, warranty_note: '', issued_at: null,
  customer: { id: 'perf-customer-1', name: 'Тест скорости', phone: '+7 900 000-00-00', phone_normalized: '79000000000' },
};

const statuses = [
  ['accepted','Принят'],['diagnostics','Диагностика'],['in_work','В работе'],
  ['waiting_part','Ждём запчасть'],['ready','Готов'],['issued','Выдан']
].map(([code,name],i)=>({code,name,group_code:'work',sort_order:i*10,actions:{}}));

function percentile(values, p) {
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*p)-1)] || 0;
}

async function installMocks(page) {
  await page.addInitScript(() => {
    localStorage.setItem('ma_crm_session_v1', 'perf.mock.session');
    localStorage.setItem('ma_crm_employee_v1', 'Администратор');
  });

  await page.route(`${SUPABASE_FUNCTIONS}**`, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, body: 'ok' });
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
    const slug = new URL(req.url()).pathname.split('/').pop();
    const op = String(body.op || '');
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', headers: {'access-control-allow-origin':'*'}, body: JSON.stringify(data) });

    if (slug === 'ma-crm-api') {
      if (op === 'bootstrap') return reply({ ok:true, actor:{kind:'admin',employee:'Администратор',role:'admin'}, services:['Моба','Nova'], employees:[{name:'Администратор',role:'manager'},{name:'Асик',role:'master'}] });
      if (op === 'list-repairs') return reply({ ok:true, repairs:[repair] });
      if (op === 'list-sales') return reply({ ok:true, sales:[] });
      return reply({ok:true});
    }

    if (slug === 'ma-crm-order-api') {
      if (op === 'detail') return reply({ ok:true, repair, history:[], paymentSummary:{paid:0,total:5000,remaining:5000,payments:[]}, customerHistory:{repairs:[],sales:[]}, statuses });
      if (op === 'commerce') return reply({ ok:true, repair:{id:repair.id,service:repair.service,estimated_price:5000,final_price:5000,due_at:null,warranty_days:14,warranty_note:''}, items:[{id:'perf-item-1',repair_id:repair.id,item_type:'service',display_type:'service',title:'Диагностика',quantity:1,unit_price:5000,unit_cost:1000,discount_amount:0,executor:'Асик'}], payments:[], totals:{itemsTotal:5000,cost:1000,profit:4000,paid:0,orderTotal:5000,balance:5000} });
      if (op === 'events') return reply({ok:true,events:[]});
      if (op === 'payroll-entries') return reply({ok:true,entries:[]});
      if (op === 'catalog') return reply({ok:true,repair:{id:repair.id,service:repair.service},categories:[{id:'perf-cat',name:'Модулька',sort_order:1,services:[{id:'perf-service',category_id:'perf-cat',name:'Замена дисплея',default_price:5000,default_cost:1500,sort_order:1}]}],uncategorizedServices:[],products:[],employees:[{name:'Асик',employee:'Асик',role:'master'}]});
      if (op === 'repair-tools') return reply({ok:true,repair,parent:null,files:[],canCreateWarranty:false});
      return reply({ok:true});
    }

    if (slug === 'ma-crm-final-api') return reply({ok:true,repair,parent:null,files:[],rows:[],total:0,canCreateWarranty:false});
    if (slug === 'ma-crm-phase1-api') return reply({ok:true,repair,items:[],payments:[],totals:{itemsTotal:5000,cost:1000,profit:4000,paid:0,orderTotal:5000,balance:5000}});
    if (slug === 'ma-crm-finance-api') return reply({ok:true,rows:[],transactions:[],cashboxes:[],totals:{}});
    if (slug === 'ma-crm-inventory-api') return reply({ok:true,rows:[],products:[],stock:[]});
    return reply({ok:true});
  });
}

test('CRM order responsiveness stays within practical mobile budgets', async ({ page }, testInfo) => {
  await installMocks(page);

  const t0 = Date.now();
  await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#crmMain')).toBeVisible();
  await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');
  const bootMs = Date.now() - t0;

  const isMobile = testInfo.project.name === 'iphone-webkit';
  const nav = isMobile ? page.locator('#mobileBottomNav [data-view="orders"]') : page.locator('.sidebar-nav .nav-item[data-view="orders"]');
  await nav.click();
  const row = isMobile ? page.locator('#repairMobileList [data-repair-id="perf-order-1"]') : page.locator('#repairTableBody [data-repair-id="perf-order-1"]');
  await expect(row).toBeVisible();

  const openStart = Date.now();
  await row.click();
  await expect(page.locator('#repairDetailOverlay')).toBeVisible();
  await expect(page.locator('#phase1Root')).toBeVisible();
  const firstOpenMs = Date.now() - openStart;

  const reopen = [];
  for (let i=0; i<8; i++) {
    await page.locator('#closeRepairDetail').click();
    await expect(page.locator('#repairDetailOverlay')).toHaveClass(/hidden/);
    const s = Date.now();
    await row.click();
    await expect(page.locator('#phase1Root')).toBeVisible();
    reopen.push(Date.now()-s);
  }

  let tabP95 = null, pickerMs = null;
  if (isMobile) {
    const tabTimes = [];
    for (const tab of ['items','payments','history','files','general','items','payments','general']) {
      const s = Date.now();
      await page.locator(`#hcOrderTabs [data-hc-tab="${tab}"]`).tap();
      await expect(page.locator(`#hcOrderTabs [data-hc-tab="${tab}"]`)).toHaveClass(/active/);
      tabTimes.push(Date.now()-s);
    }
    tabP95 = percentile(tabTimes, .95);

    await page.locator('#hcOrderTabs [data-hc-tab="items"]').tap();
    const pickerStart = Date.now();
    await page.locator('.hc-add-toggle').tap();
    await expect(page.locator('#maItemPicker')).toBeVisible();
    pickerMs = Date.now()-pickerStart;
  }

  const result = { project:testInfo.project.name, bootMs, firstOpenMs, reopenAvgMs:Math.round(reopen.reduce((a,b)=>a+b,0)/reopen.length), reopenP95Ms:percentile(reopen,.95), tabP95Ms:tabP95, pickerOpenMs:pickerMs };
  console.log(`PERF_RESULT ${JSON.stringify(result)}`);

  expect(bootMs).toBeLessThan(3000);
  expect(firstOpenMs).toBeLessThan(1500);
  expect(percentile(reopen,.95)).toBeLessThan(1200);
  if (isMobile) {
    expect(tabP95).toBeLessThan(250);
    expect(pickerMs).toBeLessThan(600);
  }
});
