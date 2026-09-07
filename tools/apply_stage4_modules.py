from pathlib import Path
import re

APP=Path('app.js')
app=APP.read_text(encoding='utf-8')
original_bytes=len(app.encode('utf-8'))


def extract_top_function(text,name):
    pattern=re.compile(r'(?m)^  (?:async\s+)?function\s+'+re.escape(name)+r'\s*\(')
    m=pattern.search(text)
    if not m:
        raise SystemExit(f'function not found: {name}')
    next_m=re.search(r'(?m)^  (?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(',text[m.end():])
    end=m.end()+next_m.start() if next_m else len(text)
    return text[m.start():end],m.start(),end


def collect_sources(text,names):
    out={}
    spans=[]
    for name in names:
        source,start,end=extract_top_function(text,name)
        out[name]=source.rstrip()+"\n\n"
        spans.append((start,end,name))
    # no overlaps
    for (s1,e1,n1),(s2,e2,n2) in zip(sorted(spans),sorted(spans)[1:]):
        if e1>s2:
            raise SystemExit(f'overlap: {n1} / {n2}')
    return out,spans


def remove_spans(text,spans):
    for start,end,name in sorted(spans,reverse=True):
        text=text[:start]+text[end:]
    return text

# 1) Device security/storage core.
device_names=[
    'loadCachedDeviceView','saveCachedDeviceView','loadShiftDeviceToken','saveShiftDeviceToken',
    'openDeviceKeyDB','loadDeviceKeyRecord','saveDeviceKeyRecord','clearDeviceKeyRecord',
    'bytesToBase64Url','generateDeviceKeyRecord','createDeviceKeyRecord','signDeviceProof'
]
device_sources,device_spans=collect_sources(app,device_names)

# 2) History presentation/helpers. Network loading/edit persistence remain in app.js.
history_names=[
    'monthStartISO','setHistoryQuickRange','historySourceText','historyServiceClass','historyDateText',
    'historyHasMismatch','historyIsProblem','historyStatus','historyCompactLine','fillEditManagerSelect',
    'renderHistoryStats','defaultHistoryDates','fillHistoryFilters','renderHistory'
]
history_sources,history_spans=collect_sources(app,history_names)

# 3) Settings core/migration/storage/validation.
settings_names=[
    'makeEmployeesFromLegacy','syncLegacyTeamsFromEmployees','normalizeScheduleSettings','mergeRemoteSettings',
    'loadSettings','saveSettings','validateNames','coreSettingsValidationError'
]
settings_sources,settings_spans=collect_sources(app,settings_names)

all_spans=device_spans+history_spans+settings_spans
app=remove_spans(app,all_spans)

# State of IndexedDB read failure is now encapsulated by devices.js.
app=app.replace('  let lastDeviceKeyReadFailed = false;\n','',1)
if 'lastDeviceKeyReadFailed' in app:
    app=app.replace('if(lastDeviceKeyReadFailed){','if(deviceSecurity.lastKeyReadFailed()){',1)
if 'lastDeviceKeyReadFailed' in app:
    raise SystemExit('unexpected lastDeviceKeyReadFailed reference remains')

# Settings core must exist before the first loadSettings() call.
settings_init='''  const settingsCore=window.MASettings.create({
    storageKey:STORAGE_KEY,
    defaults:DEFAULTS,
    removedMasterName:REMOVED_MASTER_NAME,
    masterRosterFrom:MASTER_ROSTER_FROM,
    clone:value=>clone(value),
    getSettings:()=>settings,
    legacyPairPhase:(...args)=>legacyPairPhase(...args),
    addDaysToDateString:(...args)=>addDaysToDateString(...args),
    serviceKeyForName:(...args)=>serviceKeyForName(...args),
    serviceNameForKey:(...args)=>serviceNameForKey(...args),
    shiftMinutes:value=>shiftMinutes(value)
  });
  const {
    makeEmployeesFromLegacy,
    syncLegacyTeamsFromEmployees,
    normalizeScheduleSettings,
    mergeRemoteSettings,
    loadSettings,
    saveSettings,
    validateNames,
    coreSettingsValidationError
  }=settingsCore;

'''
anchor='  let settings = loadSettings();\n'
if app.count(anchor)!=1:
    raise SystemExit('settings init anchor mismatch')
app=app.replace(anchor,settings_init+anchor,1)

# Device/history factories are initialized after the DOM helper exists.
module_init='''
  const deviceSecurity=window.MADevices.create({
    deviceViewCacheKey:DEVICE_VIEW_CACHE_KEY,
    deviceStorageKey:DEVICE_STORAGE_KEY,
    deviceKeyDb:DEVICE_KEY_DB,
    deviceKeyStore:DEVICE_KEY_STORE
  });
  const {
    loadCachedDeviceView,
    saveCachedDeviceView,
    loadShiftDeviceToken,
    saveShiftDeviceToken,
    loadDeviceKeyRecord,
    saveDeviceKeyRecord,
    clearDeviceKeyRecord,
    generateDeviceKeyRecord,
    createDeviceKeyRecord,
    signDeviceProof
  }=deviceSecurity;

  const {
    monthStartISO,
    setHistoryQuickRange,
    historySourceText,
    historyServiceClass,
    historyDateText,
    historyHasMismatch,
    historyIsProblem,
    historyStatus,
    historyCompactLine,
    fillEditManagerSelect,
    renderHistoryStats,
    defaultHistoryDates,
    fillHistoryFilters,
    renderHistory
  }=window.MAHistory.create({
    getEl:id=>$(id),
    moscowParts:(...args)=>moscowParts(...args),
    addDaysISO:(...args)=>addDaysISO(...args),
    loadHistory:(...args)=>loadHistory(...args),
    formatMoscowTime:(...args)=>formatMoscowTime(...args),
    serviceKeyForName:(...args)=>serviceKeyForName(...args),
    allHistoricalManagerNames:(...args)=>allHistoricalManagerNames(...args),
    escapeHtml:(...args)=>escapeHtml(...args),
    getSettings:()=>settings,
    isAdmin:()=>isAdmin(),
    openEditShift:row=>openEditShift(row)
  });
'''
anchor='  const employeeFilter = $("employeeFilter");\n'
if app.count(anchor)!=1:
    raise SystemExit('DOM module init anchor mismatch')
app=app.replace(anchor,anchor+module_init,1)

APP.write_text(app,encoding='utf-8')

# ----- devices.js -----
device_body=''.join(device_sources[n] for n in device_names)
devices_js=f'''(function(global){{
  "use strict";

  function create(options={{}}){{
    const DEVICE_VIEW_CACHE_KEY=String(options.deviceViewCacheKey||"ma_device_view_cache_v1");
    const DEVICE_STORAGE_KEY=String(options.deviceStorageKey||"ma_shift_device_token_v1");
    const DEVICE_KEY_DB=String(options.deviceKeyDb||"ma_shift_device_keys_v1");
    const DEVICE_KEY_STORE=String(options.deviceKeyStore||"keys");
    let lastDeviceKeyReadFailed=false;

{device_body}
    return {{
      loadCachedDeviceView,saveCachedDeviceView,loadShiftDeviceToken,saveShiftDeviceToken,
      loadDeviceKeyRecord,saveDeviceKeyRecord,clearDeviceKeyRecord,
      generateDeviceKeyRecord,createDeviceKeyRecord,signDeviceProof,
      lastKeyReadFailed:()=>lastDeviceKeyReadFailed
    }};
  }}

  global.MADevices={{create}};
}})(typeof window!=="undefined" ? window : globalThis);
'''
Path('devices.js').write_text(devices_js,encoding='utf-8')

# ----- history.js -----
history_body=''.join(history_sources[n] for n in history_names)
history_body=history_body.replace('settings.service1','getSettings().service1').replace('settings.service2','getSettings().service2')
history_js=f'''(function(global){{
  "use strict";

  function create(options={{}}){{
    const $=options.getEl;
    const moscowParts=options.moscowParts;
    const addDaysISO=options.addDaysISO;
    const loadHistory=options.loadHistory;
    const formatMoscowTime=options.formatMoscowTime;
    const serviceKeyForName=options.serviceKeyForName;
    const allHistoricalManagerNames=options.allHistoricalManagerNames;
    const escapeHtml=options.escapeHtml;
    const getSettings=options.getSettings;
    const isAdmin=options.isAdmin;
    const openEditShift=options.openEditShift;

{history_body}
    return {{
      monthStartISO,setHistoryQuickRange,historySourceText,historyServiceClass,historyDateText,
      historyHasMismatch,historyIsProblem,historyStatus,historyCompactLine,fillEditManagerSelect,
      renderHistoryStats,defaultHistoryDates,fillHistoryFilters,renderHistory
    }};
  }}

  global.MAHistory={{create}};
}})(typeof window!=="undefined" ? window : globalThis);
'''
Path('history.js').write_text(history_js,encoding='utf-8')

# ----- settings.js -----
settings_body=''.join(settings_sources[n] for n in settings_names)
settings_body=settings_body.replace('function syncLegacyTeamsFromEmployees(s=settings){','function syncLegacyTeamsFromEmployees(s=getSettings()){')
settings_body=settings_body.replace('localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));','localStorage.setItem(STORAGE_KEY, JSON.stringify(getSettings()));')
if 's=settings' in settings_body or 'JSON.stringify(settings)' in settings_body:
    raise SystemExit('settings state transformation incomplete')
settings_js=f'''(function(global){{
  "use strict";

  function create(options={{}}){{
    const STORAGE_KEY=String(options.storageKey||"ma_schedule_22_v2");
    const DEFAULTS=options.defaults||{{}};
    const REMOVED_MASTER_NAME=String(options.removedMasterName||"");
    const MASTER_ROSTER_FROM=String(options.masterRosterFrom||"0000-00-00");
    const clone=options.clone;
    const getSettings=options.getSettings;
    const legacyPairPhase=options.legacyPairPhase;
    const addDaysToDateString=options.addDaysToDateString;
    const serviceKeyForName=options.serviceKeyForName;
    const serviceNameForKey=options.serviceNameForKey;
    const shiftMinutes=options.shiftMinutes;

{settings_body}
    return {{
      makeEmployeesFromLegacy,syncLegacyTeamsFromEmployees,normalizeScheduleSettings,mergeRemoteSettings,
      loadSettings,saveSettings,validateNames,coreSettingsValidationError
    }};
  }}

  global.MASettings={{create}};
}})(typeof window!=="undefined" ? window : globalThis);
'''
Path('settings.js').write_text(settings_js,encoding='utf-8')

# ----- index.html -----
p=Path('index.html')
html=p.read_text(encoding='utf-8')
old='<script src="errors.js"></script>\n<script src="app.js"></script>'
new='<script src="errors.js"></script>\n<script src="settings.js"></script>\n<script src="devices.js"></script>\n<script src="history.js"></script>\n<script src="app.js"></script>'
if html.count(old)!=1:
    raise SystemExit('index module anchor mismatch')
html=html.replace(old,new,1)
p.write_text(html,encoding='utf-8')

# ----- tests -----
p=Path('tests/run-tests.js')
tests=p.read_text(encoding='utf-8')
anchor='loadModule("errors.js");\n'
if tests.count(anchor)!=1:
    raise SystemExit('tests load anchor mismatch')
tests=tests.replace(anchor,anchor+'loadModule("settings.js");\nloadModule("devices.js");\nloadModule("history.js");\n',1)

project_marker='// ---- Project structure ----\n'
if tests.count(project_marker)!=1:
    raise SystemExit('project marker mismatch')
extra_tests=r'''// ---- Stage 4 modules ----
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

'''
tests=tests.replace(project_marker,extra_tests+project_marker,1)
old_refs='const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","app.js"];'
new_refs='const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","settings.js","devices.js","history.js","app.js"];'
if tests.count(old_refs)!=1:
    raise SystemExit('module order refs mismatch')
tests=tests.replace(old_refs,new_refs,1)
p.write_text(tests,encoding='utf-8')

# Normalize touched files.
for name in ['app.js','index.html','devices.js','history.js','settings.js','tests/run-tests.js']:
    p=Path(name)
    text=p.read_text(encoding='utf-8')
    text='\n'.join(line.rstrip() for line in text.splitlines()).rstrip()+"\n"
    p.write_text(text,encoding='utf-8')

new_app=Path('app.js').read_text(encoding='utf-8')
print('Stage 4 modules generated')
print('APP_BEFORE_BYTES',original_bytes)
print('APP_AFTER_BYTES',len(new_app.encode('utf-8')))
print('APP_AFTER_LINES',len(new_app.splitlines()))
print('DEVICES_LINES',len(Path('devices.js').read_text(encoding='utf-8').splitlines()))
print('HISTORY_LINES',len(Path('history.js').read_text(encoding='utf-8').splitlines()))
print('SETTINGS_LINES',len(Path('settings.js').read_text(encoding='utf-8').splitlines()))
