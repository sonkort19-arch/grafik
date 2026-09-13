const { test, expect } = require('@playwright/test');

const FUNCTIONS='https://yedzfmibceboncrytbqz.supabase.co/functions/v1/';

async function installMocks(page){
  const state={warrantyWrites:0};
  const repair={id:'warranty-order-1',order_no:9101,customer_id:'customer-1',service:'Моба',device:'Телефон',model:'iPhone 15',imei:'123',issue:'Экран',estimated_price:3000,final_price:3000,manager:'Тест Менеджер',master:'Георгий',status:'issued',accepted_at:'2026-09-01T08:00:00.000Z',issued_at:'2026-09-13T08:00:00.000Z',updated_at:'2026-09-13T08:00:00.000Z',warranty_days:14,warranty_note:'14 дней',warranty_case:false,warranty_parent_id:null,customer:{id:'customer-1',name:'Тест',phone:'+7 900 000-00-00',phone_normalized:'79000000000'}};
  const statuses=[['accepted','Принят'],['diagnostics','Диагностика'],['in_work','В работе'],['waiting_part','Ждём запчасть'],['ready','Готов'],['issued','Выдан']].map(([code,name],i)=>({code,name,group_code:code==='issued'?'closed_success':'work',sort_order:i*10,actions:{}}));
  await page.addInitScript(()=>{localStorage.setItem('ma_crm_session_v1','e2e.warranty.session');localStorage.setItem('ma_crm_employee_v1','Тест Менеджер');});
  await page.route(`${FUNCTIONS}**`,async route=>{
    const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:200,body:'ok'}).catch(()=>{});return;}
    let body={};try{body=JSON.parse(req.postData()||'{}');}catch(_){}
    const slug=new URL(req.url()).pathname.split('/').pop(),op=String(body.op||'');
    const reply=async(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)}).catch(()=>{});
    if(slug==='ma-crm-api'){
      if(op==='bootstrap')return reply({ok:true,actor:{kind:'admin',employee:'Администратор',role:'admin'},services:['Моба'],employees:[{name:'Тест Менеджер',role:'manager'},{name:'Георгий',role:'master'}]});
      if(op==='list-repairs')return reply({ok:true,repairs:[repair]});
      if(op==='list-sales')return reply({ok:true,sales:[]});
      return reply({ok:true});
    }
    if(slug==='ma-crm-order-api'){
      if(op==='detail')return reply({ok:true,repair,history:[],paymentSummary:{paid:3000,total:3000,remaining:0,payments:[]},customerHistory:{repairs:[],sales:[]},statuses});
      if(op==='commerce')return reply({ok:true,repair:{id:repair.id,service:repair.service,final_price:3000,estimated_price:3000,warranty_days:14,warranty_note:'14 дней'},items:[{id:'item-1',repair_id:repair.id,item_type:'service',display_type:'service',title:'Ремонт',quantity:1,unit_price:3000,unit_cost:1000,discount_amount:0,executor:'Георгий'}],payments:[],totals:{itemsTotal:3000,cost:1000,profit:2000,paid:3000,orderTotal:3000,balance:0}});
      if(op==='events')return reply({ok:true,events:[]});
      if(op==='payroll-entries')return reply({ok:true,entries:[]});
      if(op==='catalog')return reply({ok:true,repair:{id:repair.id,service:'Моба'},categories:[],uncategorizedServices:[],products:[],employees:[]});
      return reply({ok:true});
    }
    if(slug==='ma-crm-final-api'){
      if(op==='repair-tools')return reply({ok:true,repair:{...repair,warranty_until:'2026-09-27T08:00:00.000Z'},parent:null,files:[],canCreateWarranty:true});
      if(op==='create-warranty'){
        state.warrantyWrites++;
        await new Promise(resolve=>setTimeout(resolve,250));
        return reply({ok:true,repair:{id:'warranty-child-1',order_no:9102,warranty_case:true,warranty_parent_id:repair.id}});
      }
      return reply({ok:true,rows:[],files:[]});
    }
    if(slug==='ma-crm-phase1-api')return reply({ok:true,items:[],payments:[],totals:{itemsTotal:3000,cost:1000,profit:2000,paid:3000,orderTotal:3000,balance:0}});
    if(slug==='ma-crm-finance-api')return reply({ok:true,rows:[],transactions:[],cashboxes:[],totals:{}});
    if(slug==='ma-crm-inventory-api')return reply({ok:true,rows:[],products:[],stock:[]});
    return reply({ok:true});
  });
  return state;
}

async function openOrder(page){
  await page.goto('/crm.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#crmMain')).toBeVisible();
  await page.waitForFunction(()=>window.MAOrderController?.version==='5'&&window.MACRMWarrantyGuard?.version==='1');
  await page.locator('#mobileBottomNav [data-view="orders"]').tap();
  await page.locator('#repairMobileList [data-repair-id="warranty-order-1"]').tap();
  await expect(page.locator('#repairDetailOverlay')).toBeVisible();
  await expect(page.locator('#crmFinalTools')).toBeAttached();
}

test('iPhone double tap creates only one warranty request',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='iphone-webkit','Real touch regression runs in iPhone WebKit.');
  test.setTimeout(30000);
  const state=await installMocks(page);
  await openOrder(page);
  await page.locator('#hcOrderTabs [data-hc-tab="files"]').tap();
  await page.locator('#finalWarranty').tap();
  await page.locator('#finalWarrantyReason').fill('Повторно пропало изображение');
  const button=page.locator('#finalWarrantyCreate');
  const box=await button.boundingBox();
  expect(box).toBeTruthy();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.touchscreen.tap(x,y);
  await page.touchscreen.tap(x,y);
  await expect.poll(()=>state.warrantyWrites).toBe(1);
  await expect(page.locator('.final-modal')).toHaveCount(0);
});
