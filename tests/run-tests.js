"use strict";

process.env.TZ="Europe/Moscow";

const assert=require("assert");
const fs=require("fs");
const vm=require("vm");

const results=[];
function test(name,fn){ results.push({name,fn}); }
function loadModule(file){
  vm.runInThisContext(fs.readFileSync(file,"utf8"),{filename:file});
}

const store=new Map();
global.window={};
global.localStorage={
  getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key),
  clear:()=>store.clear()
};

loadModule("schedule.js");
loadModule("shifts.js");
loadModule("employees.js");
loadModule("wallets.js");
loadModule("admin.js");
loadModule("supabase.js");
loadModule("errors.js");
loadModule("settings.js");
loadModule("devices.js");
loadModule("history.js");
loadModule("kpi.js");
loadModule("safety.js");

const settings={
  anchorDate:"2026-09-01",
  individualScheduleFrom:"2026-09-01",
  serviceBlockDays:15,
  balancedRosterEnabled:true,
  balancedRosterFrom:"2026-08-01",
  service1:"Моба",
  service2:"Нова",
  shiftStart:"08:00",
  shiftEnd:"22:00",
  novaShiftStart:"09:00",
  novaShiftEnd:"19:00",
  staffChanges:[{date:"2026-09-07",oldName:"Сергей",type:"left"}],
  dayOverrides:[],
  employeeSchedules:[
    {name:"Сергей",role:"manager",group:0,slot:0,cycleStart:"2026-08-01",workDays:5,offDays:2},
    {name:"Арсен",role:"manager",group:0,slot:1,cycleStart:"2026-08-01",workDays:2,offDays:2},
    {name:"Дина",role:"manager",group:1,slot:0,cycleStart:"2026-08-03",workDays:2,offDays:2},
    {name:"Олег",role:"master",group:0,slot:0,cycleStart:"2026-08-01",workDays:5,offDays:2},
    {name:"Георгий",role:"master",group:0,slot:1,cycleStart:"2026-08-01",workDays:2,offDays:2},
    {name:"Асик",role:"master",group:1,slot:0,cycleStart:"2026-08-03",workDays:2,offDays:2}
  ]
};

function dateObjectFromKey(key){
  const [y,m,d]=String(key).split("-").map(Number);
  return new Date(y,m-1,d);
}
function anchorParts(){
  const [year,month,day]=settings.anchorDate.split("-").map(Number);
  return {year,month:month-1,day};
}
function monthInfo(index){
  const first=new Date(2026,8+index,1);
  return {
    year:first.getFullYear(),
    month:first.getMonth(),
    days:new Date(first.getFullYear(),first.getMonth()+1,0).getDate()
  };
}
function monthIndexForYearMonth(year,month){
  return (year-2026)*12+(month-8);
}
function serviceKeyForName(name){
  return name===settings.service1?"s1":name===settings.service2?"s2":"";
}

const schedule=window.MASchedule.create({
  getSettings:()=>settings,
  anchorParts,
  monthInfo,
  serviceKeyForName,
  dateObjectFromKey,
  MASTER_ROSTER_FROM:"2026-08-24",
  MANAGER_ROSTER_FROM:"2026-09-07",
  REMOVED_MANAGER_NAME:"Сергей"
});

const shifts=window.MAShifts.create({
  getSettings:()=>settings,
  monthIndexForYearMonth,
  getDaySchedule:()=>schedule.daySchedule
});

function buildMonthRows(index){
  const info=monthInfo(index);
  const rows=[];
  for(let day=1;day<=info.days;day++) rows.push(schedule.daySchedule(index,day));
  return rows;
}

const fixedMoscowParts=()=>({date:"2026-09-07",year:2026,month:9,day:7,hour:10,minute:0,second:0});
const employees=window.MAEmployees.create({
  getSettings:()=>settings,
  moscowParts:fixedMoscowParts,
  dateObjectFromKey,
  employeesForDate:schedule.employeesForDate,
  MANAGER_ROSTER_FROM:"2026-09-07",
  EMPLOYEE_STORAGE_KEY:"test_employee_name",
  EMPLOYEE_PUSH_NAME_KEY:"test_employee_push",
  expectedForDate:shifts.expectedForDate,
  getCurrentMonthIndex:()=>0,
  monthInfo,
  buildMonthRows,
  isNoManagerValue:schedule.isNoManagerValue,
  isNoMasterValue:schedule.isNoMasterValue,
  shiftStartForService:shifts.shiftStartForService,
  shiftMinutes:shifts.shiftMinutes,
  formatMoscowTime:value=>String(value||""),
  escapeHtml:value=>String(value||""),
  getCurrentShiftRows:()=>[]
});

// ---- Schedule regression tests ----
test("07.09: Моба = Арсен + Олег; Нова = Асик один",()=>{
  const row=schedule.daySchedule(0,7);
  assert.deepStrictEqual(row.s1,{manager:"Арсен",master:"Олег"});
  assert.deepStrictEqual(row.s2,{manager:"Асик",master:"Асик"});
});

test("09.09: Моба = Дина + Олег; Нова = Георгий один",()=>{
  const row=schedule.daySchedule(0,9);
  assert.deepStrictEqual(row.s1,{manager:"Дина",master:"Олег"});
  assert.deepStrictEqual(row.s2,{manager:"Георгий",master:"Георгий"});
});

test("12.09 выходной цикл: Моба = Дина + Георгий; Нова = Асик",()=>{
  const row=schedule.daySchedule(0,12);
  assert.deepStrictEqual(row.s1,{manager:"Дина",master:"Георгий"});
  assert.deepStrictEqual(row.s2,{manager:"Асик",master:"Асик"});
});

test("14.09 вторая неделя мастеров: Нова = Георгий",()=>{
  const row=schedule.daySchedule(0,14);
  assert.strictEqual(row.s1.manager,"Арсен");
  assert.strictEqual(row.s1.master,"Олег");
  assert.deepStrictEqual(row.s2,{manager:"Георгий",master:"Георгий"});
});

test("06.09 история сохранена: в Нове нет отдельного менеджера по старому правилу",()=>{
  const row=schedule.daySchedule(0,6);
  assert.strictEqual(row.s2.manager,"Без менеджера");
  assert.strictEqual(row.s2.master,"Георгий");
});

test("Сергей исключён с 07.09, но существует в истории до этой даты",()=>{
  const before=schedule.employeesForDate(new Date(2026,8,6)).find(x=>x.name==="Сергей");
  const after=schedule.employeesForDate(new Date(2026,8,7)).find(x=>x.name==="Сергей");
  assert(before && !before.inactive);
  assert(after && after.inactive);
});

test("Однодневная ручная замена перекрывает базовый график",()=>{
  settings.dayOverrides.push({date:"2026-09-07",service:"Моба",manager:"Дина",master:"Георгий"});
  try{
    const row=schedule.daySchedule(0,7);
    assert.deepStrictEqual(row.s1,{manager:"Дина",master:"Георгий"});
    assert.deepStrictEqual(row.s2,{manager:"Асик",master:"Асик"});
  }finally{
    settings.dayOverrides.pop();
  }
});

// ---- Shift rules ----
test("Время смен по точкам не перепутано",()=>{
  assert.strictEqual(shifts.shiftStartForService("Моба"),"08:00");
  assert.strictEqual(shifts.shiftEndForService("Моба"),"22:00");
  assert.strictEqual(shifts.shiftStartForService("Нова"),"09:00");
  assert.strictEqual(shifts.shiftEndForService("Нова"),"19:00");
  assert.strictEqual(shifts.shiftMinutes("09:30"),570);
});

test("PIN смены строго 4 цифры",()=>{
  assert(shifts.isValidShiftPin("1234"));
  assert(!shifts.isValidShiftPin("123"));
  assert(!shifts.isValidShiftPin("12a4"));
  assert(!shifts.isValidShiftPin("12345"));
});

test("Ожидаемый ответственный Новы совпадает с мастером",()=>{
  assert.deepStrictEqual(shifts.expectedForDate("2026-09-07","Нова"),{manager:"Асик",master:"Асик"});
  assert.deepStrictEqual(shifts.expectedForDate("2026-09-09","Нова"),{manager:"Георгий",master:"Георгий"});
});

// ---- Employee rules ----
test("Активные сотрудники после 07.09 не содержат Сергея",()=>{
  const names=employees.activeEmployeeNames("2026-09-07");
  assert(!names.includes("Сергей"));
  ["Арсен","Дина","Олег","Георгий","Асик"].forEach(name=>assert(names.includes(name),name));
});

test("Ответственные Новы доступны как открывающие смену",()=>{
  const names=employees.activeManagerNames("2026-09-07");
  ["Арсен","Дина","Георгий","Асик"].forEach(name=>assert(names.includes(name),name));
  assert(!names.includes("Сергей"));
});

test("Личная смена Асика 07.09 определяется как Нова",()=>{
  const a=employees.employeeAssignmentForDate("Асик","2026-09-07");
  assert(a);
  assert.strictEqual(a.service,"Нова");
  assert.deepStrictEqual(a.pair,{manager:"Асик",master:"Асик"});
});

test("Выбор сотрудника сохраняется и проверяется по активному составу",()=>{
  employees.saveEmployeeName("Арсен");
  assert.strictEqual(employees.selectedEmployee(),"Арсен");
  employees.saveEmployeeName("Сергей");
  assert.strictEqual(employees.selectedEmployee(),"");
  employees.saveEmployeeName("");
});

// ---- Wallet core ----
const walletApi=window.MAWallets.create({
  moscowParts:fixedMoscowParts,
  SHIFT_TIMEZONE:"Europe/Moscow",
  MONTHS:["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"],
  WALLET_DATA_VERSION:3,
  WALLET_STORAGE_KEY:"test_wallets"
});

test("Денежный ввод не теряет копейки",()=>{
  assert.strictEqual(walletApi.parseMoneyInput("1 234,56"),123456);
  assert.strictEqual(walletApi.parseMoneyInput("100"),10000);
  assert.strictEqual(walletApi.parseMoneyInput("12,999"),null);
});

test("Миграция кошельков всегда сохраняет системную Страховку",()=>{
  const state=walletApi.normalizeWalletState({version:3,wallets:[],transactions:[]});
  const insurance=state.wallets.find(w=>w.id==="insurance");
  assert(insurance);
  assert.strictEqual(insurance.systemRole,"insurance");
  assert.strictEqual(insurance.archived,false);
});

test("Операция кошелька создаётся с точной суммой",()=>{
  const op=walletApi.buildWalletOperation("topup",[{walletId:"products",amountCents:5000}],"test",{
    operationId:"op-test",createdAt:"2026-09-07T12:00:00.000Z"
  });
  assert.strictEqual(op.operationId,"op-test");
  assert.strictEqual(op.items.length,1);
  assert.strictEqual(op.items[0].amountCents,5000);
  assert.strictEqual(op.items[0].walletId,"products");
});

// ---- Admin session ----
let adminSession=null;
let sessionChanges=0;
const adminApi=window.MAAdmin.create({
  storageKey:"test_admin",
  getSession:()=>adminSession,
  setSession:value=>{adminSession=value;},
  onSessionChange:()=>{sessionChanges++;}
});

test("Админ-сессия сохраняется, читается и очищается",()=>{
  adminApi.saveAdminSession({access_token:"abc"});
  assert(adminApi.isAdmin());
  adminSession=null;
  adminSession=adminApi.loadAdminSession();
  assert.strictEqual(adminSession.access_token,"abc");
  adminApi.saveAdminSession(null);
  assert(!adminApi.isAdmin());
  assert(sessionChanges>=2);
});

// ---- Supabase wrapper without real network ----
test("Supabase распознаёт конфигурацию и классы ошибок",()=>{
  const api=window.MASupabase.create({
    url:"https://example.supabase.co",
    publishableKey:"sb_publishable_test",
    getAdminSession:()=>null,
    saveAdminSession:()=>{}
  });
  assert(api.cloudConfigured());
  assert.strictEqual(api.classifySyncError({status:403}).kind,"forbidden");
  assert.strictEqual(api.classifySyncError({status:503}).kind,"temporary");
});

test("Supabase REST добавляет apikey и правильный URL",async()=>{
  const oldFetch=global.fetch;
  let captured=null;
  global.fetch=async(url,options)=>{
    captured={url,options};
    return {status:200,ok:true,statusText:"OK",text:async()=>"",json:async()=>({})};
  };
  try{
    const api=window.MASupabase.create({
      url:"https://example.supabase.co",
      publishableKey:"sb_publishable_test",
      getAdminSession:()=>null,
      saveAdminSession:()=>{}
    });
    const res=await api.authFetch("/rest/v1/test",{method:"GET",retryAttempts:1,timeoutMs:3000});
    assert.strictEqual(res.status,200);
    assert.strictEqual(captured.url,"https://example.supabase.co/rest/v1/test");
    assert.strictEqual(captured.options.headers.apikey,"sb_publishable_test");
    assert.strictEqual(captured.options.cache,"no-store");
  }finally{
    global.fetch=oldFetch;
  }
});

// ---- Error journal ----
let errorNow=Date.parse("2026-09-07T12:00:00.000Z");
const errorApi=window.MAErrors.create({
  storageKey:"test_errors",
  maxEntries:20,
  now:()=>new Date(errorNow),
  getContext:()=>({screen:"test",token:"context-secret"})
});

test("Журнал ошибок сохраняет ошибку и скрывает секретные данные",()=>{
  errorApi.clear();
  errorApi.log("sync",new Error("boom"),{token:"supersecret",pin:"1234",safe:"ok"});
  const rows=errorApi.list();
  assert.strictEqual(rows.length,1);
  assert.strictEqual(rows[0].scope,"sync");
  assert.strictEqual(rows[0].message,"boom");
  assert.strictEqual(rows[0].meta.token,"[REDACTED]");
  assert.strictEqual(rows[0].meta.pin,"[REDACTED]");
  assert.strictEqual(rows[0].meta.safe,"ok");
  assert.strictEqual(rows[0].context.token,"[REDACTED]");
  const text=errorApi.formatText();
  assert(!text.includes("supersecret"));
  assert(!text.includes("1234"));
});

test("Одинаковые ошибки подряд объединяются, а не засоряют журнал",()=>{
  errorApi.clear();
  errorNow=Date.parse("2026-09-07T12:00:00.000Z");
  errorApi.log("network",new Error("offline"));
  errorNow+=1000;
  errorApi.log("network",new Error("offline"));
  const rows=errorApi.list();
  assert.strictEqual(rows.length,1);
  assert.strictEqual(rows[0].count,2);
});

// ---- Stage 4 modules ----
test("Модуль устройств сохраняет токен и кеш точки",()=>{
  const api=window.MADevices.create({
    deviceViewCacheKey:"test_device_view",deviceStorageKey:"test_device_token",
    deviceKeyDb:"test_device_db",deviceKeyStore:"keys"
  });
  api.saveShiftDeviceToken("token-test");
  assert.strictEqual(api.loadShiftDeviceToken(),"token-test");
  api.saveCachedDeviceView({id:"dev-1",service:"Моба",label:"Компьютер"});
  const cached=api.loadCachedDeviceView();
  assert(cached && cached.allowed);
  assert.strictEqual(cached.device.service,"Моба");
  api.saveShiftDeviceToken("");
});

test("Модуль истории правильно определяет нарушения",()=>{
  const api=window.MAHistory.create({
    getEl:()=>null,moscowParts:fixedMoscowParts,addDaysISO:()=>"2026-09-01",loadHistory:()=>{},
    formatMoscowTime:v=>String(v||""),serviceKeyForName,allHistoricalManagerNames:()=>[],
    escapeHtml:v=>String(v||""),getSettings:()=>settings,isAdmin:()=>true,openEditShift:()=>{}
  });
  assert(api.historyIsProblem({open_late_minutes:5}));
  assert.strictEqual(api.historyStatus({opened_at:"x",closed_at:null}).text,"Не закрыта");
  assert.strictEqual(api.historyStatus({opened_at:"x",closed_at:"y",open_late_minutes:0,early_close_minutes:0}).text,"Вовремя");
});

test("Модуль настроек валидирует точки и время смены",()=>{
  const api=window.MASettings.create({
    storageKey:"test_settings",defaults:{},removedMasterName:"Ислам",masterRosterFrom:"2026-08-24",
    clone:v=>JSON.parse(JSON.stringify(v)),getSettings:()=>settings,
    legacyPairPhase:()=>0,addDaysToDateString:v=>v,serviceKeyForName,serviceNameForKey:k=>k==="s1"?settings.service1:settings.service2,
    shiftMinutes:shifts.shiftMinutes
  });
  assert.strictEqual(api.coreSettingsValidationError({...settings,service2:settings.service1}),"Названия двух точек должны отличаться");
  assert.strictEqual(api.coreSettingsValidationError({...settings,shiftStart:"22:00",shiftEnd:"08:00"}),"Конец смены должен быть позже начала");
});

// ---- Stage 5 data safety ----
test("Автокопия сохраняет график и не дублирует одинаковое состояние",()=>{
  store.clear();
  localStorage.setItem("safe_schedule",JSON.stringify({service1:"Моба"}));
  const api=window.MADataSafety.create({backupKey:"safe_backups",scheduleKey:"safe_schedule",walletKey:"safe_wallet",now:()=>new Date("2026-09-07T17:00:00Z")});
  api.capture("Первая");
  api.capture("Повтор");
  assert.strictEqual(api.list().length,1);
  assert.strictEqual(api.latest().reason,"Повтор");
  assert.deepStrictEqual(api.scheduleFromSnapshot(api.latest()),{service1:"Моба"});
});

test("Автокопия умеет сохранить кошельки без секретных ключей",()=>{
  store.clear();
  localStorage.setItem("safe_schedule",JSON.stringify({service1:"Моба"}));
  localStorage.setItem("safe_wallet",JSON.stringify({transactions:[{id:"t1"}]}));
  localStorage.setItem("ma_schedule_admin_session_v1","SECRET");
  const api=window.MADataSafety.create({backupKey:"safe_backups",scheduleKey:"safe_schedule",walletKey:"safe_wallet"});
  const snap=api.capture("Полная",{includeWallet:true});
  assert(snap.walletRaw.includes("t1"));
  const exported=JSON.stringify(api.exportBundle({settings:{service1:"Моба"},walletState:{transactions:[]}}));
  assert(!exported.includes("SECRET"));
});

test("Полная резервная копия и старый формат читаются одинаково безопасно",()=>{
  const api=window.MADataSafety.create({backupKey:"safe_parse",scheduleKey:"x",walletKey:"y"});
  const full=api.parseBackupText(JSON.stringify({format:"ma-grafik-backup",version:2,schedule:{service1:"Моба"},wallets:{transactions:[]}}));
  assert.strictEqual(full.format,"bundle");
  assert.strictEqual(full.schedule.service1,"Моба");
  assert(full.wallets);
  const legacy=api.parseBackupText(JSON.stringify({service1:"Моба",service2:"Нова"}));
  assert.strictEqual(legacy.format,"legacy");
  assert.strictEqual(legacy.wallets,null);
});

test("Конфликт облака определяется только при реальном расхождении",()=>{
  const api=window.MADataSafety.create({backupKey:"safe_conflict",scheduleKey:"x",walletKey:"y"});
  const stable=v=>JSON.stringify(v);
  assert.strictEqual(api.cloudConflict({knownUpdatedAt:"a",remoteUpdatedAt:"a",remoteSettings:{x:1},nextSettings:{x:2},stableStringify:stable}),false);
  assert.strictEqual(api.cloudConflict({knownUpdatedAt:"a",remoteUpdatedAt:"b",remoteSettings:{x:2},nextSettings:{x:2},stableStringify:stable}),false);
  assert.strictEqual(api.cloudConflict({knownUpdatedAt:"a",remoteUpdatedAt:"b",remoteSettings:{x:1},nextSettings:{x:2},stableStringify:stable}),true);
});

test("Слишком большие кошельки не ломают локальную автокопию графика",()=>{
  store.clear();
  localStorage.setItem("safe_schedule",JSON.stringify({ok:true}));
  localStorage.setItem("safe_wallet","x".repeat(120000));
  const api=window.MADataSafety.create({backupKey:"safe_big",scheduleKey:"safe_schedule",walletKey:"safe_wallet",maxWalletBytes:100000});
  const snap=api.capture("Большая",{includeWallet:true});
  assert.strictEqual(snap.walletRaw,"");
  assert.strictEqual(snap.walletSkipped,true);
  assert.deepStrictEqual(api.scheduleFromSnapshot(snap),{ok:true});
});


// ---- Employee KPI ----
const kpiApi=window.MAKpi.create({
  expectedForDate:shifts.expectedForDate,
  serviceNames:()=>[settings.service1,settings.service2],
  getEmployeesForDate:key=>schedule.employeesForDate(dateObjectFromKey(key)),
  isNoManagerValue:schedule.isNoManagerValue,
  shiftStartForService:shifts.shiftStartForService,
  shiftEndForService:shifts.shiftEndForService,
  shiftMinutes:shifts.shiftMinutes,
  moscowParts:()=>({date:"2026-09-07",hour:22,minute:30}),
  escapeHtml:value=>String(value??"")
});

test("KPI: опоздание снижает оценку, а сотрудник без первого открытия не штрафуется",()=>{
  const rows=[{
    service:"Моба",shift_date:"2026-09-07",opened_at:"2026-09-07T05:12:00.000Z",opened_by:"Арсен",
    open_late_minutes:12,closed_at:"2026-09-07T19:00:00.000Z",closed_by:"Арсен",early_close_minutes:0
  }];
  const result=kpiApi.calculate(rows,{from:"2026-09-07",to:"2026-09-07",now:{date:"2026-09-07",hour:22,minute:30}});
  const arsen=result.employees.find(x=>x.name==="Арсен");
  const asik=result.employees.find(x=>x.name==="Асик");
  assert(arsen);assert(asik);
  assert.strictEqual(arsen.total,1);
  assert.strictEqual(arsen.late,1);
  assert.strictEqual(arsen.score,95);
  assert.strictEqual(asik.total,0);
  assert.strictEqual(asik.score,null);
});

test("KPI: пропуск считается после первого подтверждённого открытия",()=>{
  const arsenDates=[];
  for(let day=7;day<=20;day++){
    const date=`2026-09-${String(day).padStart(2,"0")}`;
    if(shifts.expectedForDate(date,"Моба")?.manager==="Арсен") arsenDates.push(date);
  }
  assert(arsenDates.length>=2);
  const activationDate=arsenDates[0], missedDate=arsenDates[1];
  const rows=[{
    service:"Моба",shift_date:activationDate,opened_at:`${activationDate}T05:00:00.000Z`,opened_by:"Арсен",
    open_late_minutes:0,closed_at:`${activationDate}T19:00:00.000Z`,closed_by:"Арсен",early_close_minutes:0
  }];
  const result=kpiApi.calculate(rows,{from:missedDate,to:missedDate,now:{date:missedDate,hour:22,minute:30}});
  const arsen=result.employees.find(x=>x.name==="Арсен");
  assert(arsen);
  assert.strictEqual(arsen.total,1);
  assert.strictEqual(arsen.worked,0);
  assert.strictEqual(arsen.missed,1);
  assert.strictEqual(arsen.score,80);
});

test("KPI: аннулированная смена исключается и не портит сотруднику оценку",()=>{
  const rows=[{service:"Моба",shift_date:"2026-09-07",voided_at:"2026-09-07T10:00:00.000Z",opened_at:"2026-09-07T05:00:00.000Z",opened_by:"Арсен"}];
  const result=kpiApi.calculate(rows,{from:"2026-09-07",to:"2026-09-07",now:{date:"2026-09-07",hour:22,minute:30}});
  const arsen=result.employees.find(x=>x.name==="Арсен");
  assert(arsen);
  assert.strictEqual(arsen.total,0);
  assert.strictEqual(arsen.score,null);
});

test("KPI: мастер без ответственной смены получает «нет данных», а не штраф",()=>{
  const rows=[
    {service:"Моба",shift_date:"2026-09-07",opened_at:"2026-09-07T05:00:00.000Z",opened_by:"Арсен",open_late_minutes:0,closed_at:"2026-09-07T19:00:00.000Z",early_close_minutes:0},
    {service:"Нова",shift_date:"2026-09-07",opened_at:"2026-09-07T06:00:00.000Z",opened_by:"Асик",open_late_minutes:0,closed_at:"2026-09-07T16:00:00.000Z",early_close_minutes:0}
  ];
  const result=kpiApi.calculate(rows,{from:"2026-09-07",to:"2026-09-07",now:{date:"2026-09-07",hour:22,minute:30}});
  const oleg=result.employees.find(x=>x.name==="Олег");
  assert(oleg);
  assert.strictEqual(oleg.total,0);
  assert.strictEqual(oleg.score,null);
  assert.strictEqual(oleg.status.key,"nodata");
});

// ---- Project structure ----
test("index.html подключает модули в безопасном порядке",()=>{
  const html=fs.readFileSync("index.html","utf8");
  const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","settings.js","devices.js","history.js","kpi.js","safety.js","app.js"];
  const positions=refs.map(file=>html.indexOf(`<script src="${file}"></script>`));
  assert(positions.every(x=>x>=0));
  assert.deepStrictEqual(positions,[...positions].sort((a,b)=>a-b));
  assert(!html.includes("<script>\n(function(){"));
});

(async()=>{
  let passed=0;
  for(const {name,fn} of results){
    try{
      await fn();
      passed++;
      console.log(`✓ ${name}`);
    }catch(error){
      console.error(`✗ ${name}`);
      console.error(error && error.stack ? error.stack : error);
      process.exitCode=1;
    }
  }
  console.log(`\nMA График: ${passed}/${results.length} тестов пройдено.`);
  if(passed!==results.length) process.exitCode=1;
})();
