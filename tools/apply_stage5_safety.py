from pathlib import Path
import re


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old,new,1)


def function_bounds(text,name):
    m=re.search(r'(?m)^\s*(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(',text)
    if not m: raise SystemExit(f'function not found: {name}')
    i=text.find('{',m.end()); depth=0; state='code'; quote=''; esc=False
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ''
        if state=='code':
            if c in "'\"`": state='str'; quote=c; esc=False
            elif c=='/' and n=='/': state='line'; i+=1
            elif c=='/' and n=='*': state='block'; i+=1
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:return m.start(),i+1
        elif state=='str':
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: state='code'
        elif state=='line':
            if c=='\n': state='code'
        elif state=='block':
            if c=='*' and n=='/': state='code'; i+=1
        i+=1
    raise SystemExit(f'unclosed function: {name}')

safety=r'''(function(global){
  "use strict";

  function create(options={}){
    const backupKey=String(options.backupKey||"ma_data_safety_backups_v1");
    const scheduleKey=String(options.scheduleKey||"ma_schedule_22_v2");
    const walletKey=String(options.walletKey||"ma_personal_wallets_v1");
    const maxBackups=Math.max(3,Math.min(20,Number(options.maxBackups)||8));
    const maxWalletBytes=Math.max(100000,Number(options.maxWalletBytes)||750000);
    const now=typeof options.now==="function"?options.now:()=>new Date();

    function storage(){
      try{return global.localStorage||globalThis.localStorage||null;}catch(_){return null;}
    }
    function raw(key){try{return storage()?.getItem(key)||"";}catch(_){return "";}}
    function hash(text){
      let h=2166136261;
      for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
      return (h>>>0).toString(16).padStart(8,"0");
    }
    function isoNow(){
      const value=now();
      const d=value instanceof Date?value:new Date(value);
      return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();
    }
    function list(){
      try{
        const parsed=JSON.parse(raw(backupKey)||"[]");
        return Array.isArray(parsed)?parsed.filter(x=>x&&x.id&&x.at):[];
      }catch(_){return [];}
    }
    function write(entries){
      let next=entries.slice(0,maxBackups);
      while(next.length){
        try{storage()?.setItem(backupKey,JSON.stringify(next));return next;}catch(_){next=next.slice(0,-1);}
      }
      try{storage()?.removeItem(backupKey);}catch(_){ }
      return [];
    }
    function capture(reason="Автокопия",opts={}){
      const scheduleRaw=raw(scheduleKey);
      let walletRaw=opts.includeWallet?raw(walletKey):"";
      let walletSkipped=false;
      if(walletRaw && walletRaw.length>maxWalletBytes){walletRaw="";walletSkipped=true;}
      if(!scheduleRaw && !walletRaw)return null;
      const signature=hash(`${scheduleRaw}|${walletRaw}`);
      const entries=list();
      const at=isoNow();
      if(entries[0]&&entries[0].signature===signature){
        entries[0].lastSeenAt=at;
        entries[0].reason=String(reason||entries[0].reason||"Автокопия").slice(0,160);
        if(walletSkipped)entries[0].walletSkipped=true;
        write(entries);
        return entries[0];
      }
      const item={
        id:`backup-${Date.parse(at)||Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        at,
        reason:String(reason||"Автокопия").slice(0,160),
        signature,
        scheduleRaw:scheduleRaw||"",
        walletRaw:walletRaw||"",
        walletSkipped
      };
      entries.unshift(item);
      write(entries);
      return item;
    }
    function latest(){return list()[0]||null;}
    function parseJson(rawValue){
      if(!rawValue)return null;
      const value=JSON.parse(rawValue);
      return value&&typeof value==="object"?value:null;
    }
    function scheduleFromSnapshot(snapshot){return parseJson(snapshot?.scheduleRaw||"");}
    function walletFromSnapshot(snapshot){return parseJson(snapshot?.walletRaw||"");}
    function exportBundle({settings,walletState}={}){
      return {
        format:"ma-grafik-backup",
        version:2,
        exportedAt:isoNow(),
        schedule:settings&&typeof settings==="object"?settings:null,
        wallets:walletState&&typeof walletState==="object"?walletState:null
      };
    }
    function parseBackupText(text){
      const parsed=JSON.parse(String(text||""));
      if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Неверный формат резервной копии");
      if(parsed.format==="ma-grafik-backup"){
        if(!parsed.schedule||typeof parsed.schedule!=="object")throw new Error("В резервной копии нет графика");
        return {format:"bundle",version:Number(parsed.version)||1,schedule:parsed.schedule,wallets:parsed.wallets&&typeof parsed.wallets==="object"?parsed.wallets:null};
      }
      return {format:"legacy",version:1,schedule:parsed,wallets:null};
    }
    function cloudConflict({knownUpdatedAt,remoteUpdatedAt,remoteSettings,nextSettings,stableStringify}={}){
      if(!knownUpdatedAt||!remoteUpdatedAt||String(knownUpdatedAt)===String(remoteUpdatedAt))return false;
      const stable=typeof stableStringify==="function"?stableStringify:(v=>JSON.stringify(v));
      try{return stable(remoteSettings)!==stable(nextSettings);}catch(_){return true;}
    }
    return {list,latest,capture,scheduleFromSnapshot,walletFromSnapshot,exportBundle,parseBackupText,cloudConflict};
  }

  global.MADataSafety={create};
})(typeof window!=="undefined"?window:globalThis);
'''
Path('safety.js').write_text(safety,encoding='utf-8')

# app.js
p=Path('app.js'); app=p.read_text(encoding='utf-8')
app=replace_once(app,'  const ERROR_LOG_KEY = "ma_error_log_v1";\n','  const ERROR_LOG_KEY = "ma_error_log_v1";\n  const SAFETY_BACKUP_KEY = "ma_data_safety_backups_v1";\n','safety key')

anchor='  let walletState = loadWalletState();\n'
init='''  let walletState = loadWalletState();
  const dataSafety=window.MADataSafety.create({
    backupKey:SAFETY_BACKUP_KEY,
    scheduleKey:STORAGE_KEY,
    walletKey:WALLET_STORAGE_KEY,
    maxBackups:8,
    maxWalletBytes:750000
  });
'''
app=replace_once(app,anchor,init,'safety init')

anchor='  const employeeFilter = $("employeeFilter");\n'
helpers=r'''

  function backupTimeLabel(value){
    const ms=Date.parse(value||"");
    if(!ms)return "—";
    try{return new Intl.DateTimeFormat("ru-RU",{timeZone:SHIFT_TIMEZONE,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(ms));}
    catch(_){return String(value||"—");}
  }

  function renderBackupStatus(){
    const root=$("backupStatus");if(!root)return;
    const rows=dataSafety.list();
    if(!rows.length){root.textContent="Автокопий пока нет. Они создаются перед опасными изменениями.";return;}
    const latest=rows[0];
    const walletText=latest.walletRaw?" · с кошельками":(latest.walletSkipped?" · кошельки слишком большие для локальной копии":"");
    root.textContent=`Автокопий: ${rows.length} · последняя ${backupTimeLabel(latest.at)} · ${latest.reason||"Автокопия"}${walletText}`;
  }

  function createDataBackup(reason,includeWallet=false,showToast=false){
    const snapshot=dataSafety.capture(reason,{includeWallet});
    renderBackupStatus();
    if(showToast){
      if(!snapshot)toast("Нет данных для резервной копии");
      else if(snapshot.walletSkipped)toast("График сохранён. Кошельки слишком большие для локальной автокопии — скачайте полную копию файлом");
      else toast("Резервная копия создана");
    }
    return snapshot;
  }

  function downloadFullBackup(prefix="MA_Grafik_full_backup"){
    const bundle=dataSafety.exportBundle({settings,walletState});
    const blob=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    const date=moscowParts().date;
    a.href=url;a.download=`${prefix}_${date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }

  async function restoreLatestBackup(){
    const snapshot=dataSafety.latest();
    if(!snapshot?.scheduleRaw){toast("Нет автокопии графика для восстановления");return;}
    if(cloudConfigured()&&!isAdmin()){openLoginModal();toast("Для восстановления войдите как администратор");return;}
    let restored;
    try{restored=normalizeScheduleSettings(dataSafety.scheduleFromSnapshot(snapshot));}
    catch(e){toast("Автокопия повреждена");return;}
    const validationError=coreSettingsValidationError(restored);
    if(validationError){toast(`Автокопия не восстановлена: ${validationError}`);return;}
    if(!confirm(`Восстановить график из автокопии ${backupTimeLabel(snapshot.at)}?\n\nТекущий график сначала будет сохранён ещё одной копией.`))return;

    const previous=clone(settings);
    createDataBackup("Перед восстановлением автокопии",false,false);
    const busy=beginButtonBusy("restoreLatestBackupBtn","Восстанавливаем…");
    if(!busy)return;
    try{
      if(cloudConfigured())await saveToCloud(restored,{force:true});
      settings=restored;
      saveSettings();
      settingsDirty=false;
      currentIndex=getCurrentMonthIndex();userSelectedMonth=false;
      lastSettingsSignature=stableJson(settings);
      populateSettings();renderMonth();renderTodayShifts();
      toast(cloudConfigured()?"График восстановлен на всех устройствах":"График восстановлен");
    }catch(e){
      logAppError("backup restore",e);
      settings=previous;saveSettings();lastSettingsSignature=stableJson(settings);populateSettings();renderMonth();
      toast(e.message||"Не удалось восстановить автокопию");
    }finally{endButtonBusy(busy);}
  }
'''
app=replace_once(app,anchor,anchor+helpers,'safety helpers')

# cloud replacement backup
app=replace_once(app,'          if(settingsChanged){\n            const y=window.scrollY;\n            settings=remoteSettings;','          if(settingsChanged){\n            const y=window.scrollY;\n            createDataBackup("Перед обновлением графика из облака",false,false);\n            settings=remoteSettings;','cloud replacement backup')

# replace saveToCloud
start,end=function_bounds(app,'saveToCloud')
new_save=r'''  async function saveToCloud(newSettings,{force=false}={}){
    if(!cloudConfigured()) throw new Error("Supabase ещё не подключён");
    const token=await getAdminToken(); if(!token) throw new Error("Нужно войти как администратор");
    setCloudStatus("Сохранение…","syncing");
    const now=new Date().toISOString();
    try{
      if(!force){
        const check=await authFetch(`/rest/v1/${CLOUD_TABLE}?id=eq.${encodeURIComponent(CLOUD_ROW_ID)}&select=settings,updated_at`,{
          method:"GET",headers:{Authorization:"Bearer "+token}
        });
        if(!check.ok) throw await httpErrorFromResponse(check,"Не удалось проверить актуальность общего графика");
        const rows=await check.json().catch(()=>[]);
        const remote=Array.isArray(rows)?rows[0]:null;
        if(remote?.updated_at && dataSafety.cloudConflict({
          knownUpdatedAt:lastCloudUpdatedAt,
          remoteUpdatedAt:remote.updated_at,
          remoteSettings:mergeRemoteSettings(remote.settings||{}),
          nextSettings:newSettings,
          stableStringify:stableJson
        })){
          const conflict=new Error("Общий график уже изменён на другом устройстве. Нажмите «Обновить из облака», проверьте изменения и сохраните снова.");
          conflict.code="cloud_conflict";
          throw conflict;
        }
      }

      const res=await authFetch(`/rest/v1/${CLOUD_TABLE}?on_conflict=id`,{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Prefer":"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify({id:CLOUD_ROW_ID,settings:newSettings,updated_at:now})
      });
      const data=await res.json().catch(()=>null);
      if(!res.ok) throw new Error((data && (data.message||data.error_description)) || "Не удалось сохранить в облако");
      lastCloudUpdatedAt=(Array.isArray(data)&&data[0]&&data[0].updated_at) || now;
      setCloudStatus("Онлайн","online");
      return true;
    }catch(e){
      setCloudStatus(navigator.onLine===false?"Нет связи":"Ошибка","offline");
      throw e;
    }
  }'''
app=app[:start]+new_save+app[end:]

# wallet clear safety: local snapshot + forced full file download before irreversible delete
needle='''    const previous=clone(walletState);
    walletBusy=true;
'''
replacement='''    createDataBackup("Перед очисткой истории кошельков",true,false);
    downloadFullBackup("MA_Grafik_before_wallet_clear");
    const previous=clone(walletState);
    walletBusy=true;
'''
app=replace_once(app,needle,replacement,'wallet clear backup')

# populate backup status
app=replace_once(app,'    renderErrorLog();\n    updateSettingsSystemStatus();','    renderErrorLog();\n    renderBackupStatus();\n    updateSettingsSystemStatus();','populate backup status')

# export full bundle
start,end=function_bounds(app,'exportSettings')
new_export='''  function exportSettings(){
    downloadFullBackup("MA_Grafik_full_backup");
    toast("Полная резервная копия скачана");
  }'''
app=app[:start]+new_export+app[end:]

# import supports legacy + full bundle and makes pre-import snapshot
start,end=function_bounds(app,'importSettings')
new_import=r'''  function importSettings(file){
    if(importSettingsBusy) return;
    const busy=beginButtonBusy("importBtn","Восстанавливаем…");
    if(!busy) return;
    importSettingsBusy=true;

    const finish=()=>{importSettingsBusy=false;endButtonBusy(busy);};
    const r=new FileReader();
    r.onerror=()=>{toast("Не удалось прочитать резервную копию");finish();};
    r.onload=async()=>{
      const previousSettings=clone(settings);
      const previousWallets=clone(walletState);
      let scheduleSavedToCloud=false;
      try{
        const parsed=dataSafety.parseBackupText(r.result);
        const s=normalizeScheduleSettings(parsed.schedule);
        const validationError=coreSettingsValidationError(s);
        if(validationError){toast(`Резервная копия не загружена: ${validationError}`);return;}
        if(cloudConfigured() && !isAdmin()){
          openLoginModal();toast("Для импорта войди как администратор");return;
        }
        const walletNote=parsed.wallets?"\n\nКошельки из копии будут восстановлены безопасным объединением: более новые облачные операции удаляться не будут.":"";
        if(!confirm(`Заменить текущий график данными из резервной копии?${walletNote}`)) return;

        const renamed=[];
        if(s.service1!==settings.service1) renamed.push(settings.service1);
        if(s.service2!==settings.service2) renamed.push(settings.service2);
        if(renamed.length && isAdmin()){
          const devicesLoaded=await loadRegisteredDevices();
          if(!devicesLoaded){toast("Не удалось проверить рабочие устройства. Импорт отменён.");return;}
          const active=deviceListCache.filter(d=>d.active && renamed.includes(d.service));
          if(active.length){
            const names=[...new Set(active.map(d=>d.service))].join(", ");
            toast(`Сначала отключи рабочее устройство точки: ${names}`);return;
          }
          const todayRows=(currentShiftRows||[]).filter(row=>renamed.includes(row.service)&&!row.voided_at);
          if(todayRows.length){toast("Импорт меняет название точки, но сегодня уже есть запись смены со старым названием. Импорт отменён.");return;}
        }

        createDataBackup("Перед восстановлением из файла",true,false);
        if(cloudConfigured()){await saveToCloud(s,{force:true});scheduleSavedToCloud=true;}
        settings=s;saveSettings();
        currentIndex=getCurrentMonthIndex();userSelectedMonth=false;
        lastSettingsSignature=stableJson(settings);settingsDirty=false;

        let walletsMerged=false;
        if(parsed.wallets){
          walletState=normalizeWalletState(parsed.wallets);
          walletState.configUpdatedAt=new Date().toISOString();
          saveWalletState();
          if(cloudConfigured()&&isAdmin()) walletsMerged=await syncWalletsCloud(false,true);
          else walletsMerged=true;
        }

        populateSettings();renderMonth();renderTodayShifts();
        if(parsed.wallets){
          toast(walletsMerged?"График и кошельки восстановлены":"График восстановлен. Кошельки сохранены локально и синхронизируются позже");
        }else{
          toast(cloudConfigured()?"Резервная копия графика загружена для всех":"Резервная копия графика загружена");
        }
      }catch(e){
        logAppError("backup import",e);
        if(!scheduleSavedToCloud){settings=previousSettings;saveSettings();}
        walletState=previousWallets;try{saveWalletState();}catch(_){ }
        toast(e.message||"Не удалось открыть файл");
      }finally{finish();}
    };
    r.readAsText(file);
  }'''
app=app[:start]+new_import+app[end:]

# reset snapshot before destructive reset
app=replace_once(app,'    try{\n      settings=next;','    try{\n      createDataBackup("Перед полным сбросом графика",false,false);\n      settings=next;','reset backup')

# events for manual/restore auto backups
app=replace_once(app,'  $("exportBtn").onclick=exportSettings;\n','  $("exportBtn").onclick=exportSettings;\n  $("manualBackupBtn").onclick=()=>createDataBackup("Ручная автокопия",true,true);\n  $("restoreLatestBackupBtn").onclick=restoreLatestBackup;\n','backup events')
p.write_text(app,encoding='utf-8')

# index.html
p=Path('index.html'); html=p.read_text(encoding='utf-8')
old='''              <div class="settings-actions" style="margin-top:10px">
                <button class="secondary" id="forceSyncBtn">Обновить из облака</button>
                <button class="secondary" id="exportBtn">Скачать резервную копию</button>
                <button class="secondary" id="importBtn">Восстановить из копии</button>
              </div>
              <input type="file" id="importFile" accept="application/json" class="hidden">
'''
new='''              <div class="notice" id="backupStatus" style="margin-top:10px">Проверяем резервные копии…</div>
              <div class="settings-actions" style="margin-top:10px">
                <button class="secondary" id="forceSyncBtn">Обновить из облака</button>
                <button class="secondary" id="manualBackupBtn">Создать автокопию</button>
                <button class="secondary" id="restoreLatestBackupBtn">Восстановить последнюю</button>
                <button class="secondary" id="exportBtn">Скачать полную копию</button>
                <button class="secondary" id="importBtn">Восстановить из файла</button>
              </div>
              <div class="small" style="margin-top:8px">Автокопии хранятся только на этом устройстве. Полная скачанная копия содержит график и кошельки, но не содержит пароль администратора, PIN или ключ рабочего устройства.</div>
              <input type="file" id="importFile" accept="application/json" class="hidden">
'''
html=replace_once(html,old,new,'backup settings UI')
html=replace_once(html,'<script src="history.js"></script>\n<script src="app.js"></script>','<script src="history.js"></script>\n<script src="safety.js"></script>\n<script src="app.js"></script>','safety script')
p.write_text(html,encoding='utf-8')

# tests
p=Path('tests/run-tests.js'); tests=p.read_text(encoding='utf-8')
tests=replace_once(tests,'loadModule("history.js");\n','loadModule("history.js");\nloadModule("safety.js");\n','load safety')
marker='// ---- Project structure ----\n'
stage5=r'''// ---- Stage 5 data safety ----
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

'''
tests=replace_once(tests,marker,stage5+marker,'stage5 tests')
tests=replace_once(tests,'const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","settings.js","devices.js","history.js","app.js"];','const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","settings.js","devices.js","history.js","safety.js","app.js"];','module order')
p.write_text(tests,encoding='utf-8')

print('Stage 5 data safety patch applied')
