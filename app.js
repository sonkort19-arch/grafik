(function(){
  "use strict";
  const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  const WD = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
  const STORAGE_KEY = "ma_schedule_22_v2";
  const DEVICE_VIEW_CACHE_KEY = "ma_device_view_cache_v1";
  const TODAY_SHIFT_CACHE_KEY = "ma_today_shift_cache_v1";
  const ERROR_LOG_KEY = "ma_error_log_v1";
  const SAFETY_BACKUP_KEY = "ma_data_safety_backups_v1";
  const WALLET_STORAGE_KEY = "ma_personal_wallets_v1";
  const WALLET_DATA_VERSION = 3;
  const WALLET_PLAN_TABLE = "ma_wallet_plans";
  const WALLET_CONFIG_TABLE = "ma_wallet_config";
  const WALLET_TX_TABLE = "ma_wallet_transactions";
  const WALLET_CLOUD_PAGE_SIZE = 1000;
  const WALLET_CLOUD_MAX_ROWS = 100000;

  // === ОБЩИЙ ОНЛАЙН-ГРАФИК ===
  // Вставь сюда данные Supabase перед загрузкой файла в Vercel.
  const SUPABASE_URL = "https://yedzfmibceboncrytbqz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const CLOUD_TABLE = "ma_schedule_config";
  const CLOUD_ROW_ID = "main";
  const AUTH_STORAGE_KEY = "ma_schedule_admin_session_v1";
  const DEVICE_STORAGE_KEY = "ma_shift_device_token_v1";
  const DEVICE_KEY_DB = "ma_shift_device_keys_v1";
  const DEVICE_KEY_STORE = "keys";
  const EMPLOYEE_STORAGE_KEY = "ma_employee_name_v1";
  const EMPLOYEE_PUSH_NAME_KEY = "ma_employee_push_name_v1";
  const SYNC_INTERVAL_MS = 30000;
  const SHIFT_TABLE = "ma_shifts";
  const SHIFT_FUNCTION_URL = SUPABASE_URL + "/functions/v1/ma-shifts";
  const VAPID_PUBLIC_KEY = "BNa-XTPFzPk8s00Rl5j9uTkBPgYHTM-zMaw6aVXP1HQSfoFfKCy_B4sf0Svcs5Tv7h_ue2-OWQBOQk41MepJOik";
  const SHIFT_POLL_MS = 30000;
  const SHIFT_TIMEZONE = "Europe/Moscow";
  const STARTUP_SHIFT_MODE = new URLSearchParams(location.search).get("startup")==="1";
  const MASTER_ROSTER_FROM = "2026-08-24";
  const MASTER_TEMP_TO = "2026-08-31";
  const MANAGER_ROSTER_FROM = "2026-09-07";
  const REMOVED_MASTER_NAME = "Ислам";
  const REMOVED_MANAGER_NAME = "Сергей";

  const DEFAULTS = {
    anchorDate: "2026-09-01",
    individualScheduleFrom: "2026-09-01",
    serviceBlockDays: 15,
    balancedRosterEnabled: true,
    balancedRosterFrom: "2026-08-01",
    service1: "Моба",
    service2: "Нова",
    shiftStart: "08:00",
    shiftEnd: "22:00",
    managers: [["Сергей","Арсен"],["Дина","Амалия"]],
    masters: [["Олег","Георгий"],["Асик",""]],
    staffChanges: [],
    dayOverrides: []
  };

  const settingsCore=window.MASettings.create({
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

  let settings = loadSettings();
  let currentIndex = getCurrentMonthIndex();
  let userSelectedMonth = false;
  let adminSession = null;
  const {
    loadAdminSession,
    saveAdminSession,
    isAdmin,
    adminAccessToken
  }=window.MAAdmin.create({
    storageKey:AUTH_STORAGE_KEY,
    getSession:()=>adminSession,
    setSession:value=>{ adminSession=value; },
    onSessionChange:()=>updateAuthUI()
  });
  adminSession=loadAdminSession();
  const {
    cloudConfigured,
    sleepMs,
    httpErrorFromResponse,
    classifySyncError,
    authFetch,
    loginAdmin,
    refreshAdminSession,
    getAdminToken
  }=window.MASupabase.create({
    url:SUPABASE_URL,
    publishableKey:SUPABASE_PUBLISHABLE_KEY,
    getAdminSession:()=>adminSession,
    saveAdminSession
  });
  let settingsDirty = false;
  let lastCloudUpdatedAt = null;
  let syncTimer = null;
  let shiftPollTimer = null;
  let cloudSyncPromise = null;
  let todayShiftRequestPromise = null;
  let lastCloudFetchAt = 0;
  let lastTodayShiftFetchAt = 0;
  let currentShiftRows = [];
  let pendingShiftAction = null;
  let editingShiftRow = null;
  let quickReplaceFixedContext = false;
  let quickReplaceSaving = false;
  let importSettingsBusy = false;
  let historyLoadSeq = 0;
  let kpiLoadSeq = 0;
  let historyRowsTruncated = false;
  let deviceListLoadState = "unknown";
  const {
    walletCurrentMonthKey,walletMonthKeyFromIso,walletMonthLabel,walletShiftMonth,walletStartOfMonthIso,
    walletLegacyDefaults,emptyWalletState,walletBackupBeforeMigration,normalizeWalletDefinition,
    normalizeWalletTransaction,normalizeWalletState,loadWalletState,
    parseMoneyInput,moneyInputValue,formatMoney,walletTransactionMonth,
    walletNewId,walletNewOperationId,walletNewTransactionId,buildWalletOperation
  }=window.MAWallets.create({
    moscowParts,
    SHIFT_TIMEZONE,
    MONTHS,
    WALLET_DATA_VERSION,
    WALLET_STORAGE_KEY
  });
  let walletState = loadWalletState();
  const dataSafety=window.MADataSafety.create({
    backupKey:SAFETY_BACKUP_KEY,
    scheduleKey:STORAGE_KEY,
    walletKey:WALLET_STORAGE_KEY,
    maxBackups:8,
    maxWalletBytes:750000
  });
  let walletBusy = false;
  let walletCloudSyncPromise = null;
  let lastWalletCloudFetchAt = 0;
  let walletCloudNeedsSetup = false;
  let walletViewMonthKey = walletCurrentMonthKey();
  let walletListFilter = "all";
  let pendingArchiveWalletId = "";
  let walletEditingId = "";
  let walletCorrectionOperationId = "";
  const adminMutationLocks = new Set();
  let serviceWorkerRegistration = null;
  let serviceWorkerControllerListenerBound=false;
  let serviceWorkerReloading=false;
  let lastServiceWorkerUpdateAt=0;
  let responsiveRefreshTimer=null;
  let resumeRefreshPromise=null;
  let lastResumeRefreshAt=0;
  let appInitialized=false;
  let deferredGrafikInstallPrompt=null;
  let grafikAppInstalled=false;
  let startupDeviceRetryTimer=null;
  let startupDeviceRetryCount=0;
  let lastShiftSignature = "";
  let lastSettingsSignature = "";
  let lastAttentionSignature = "";
  let currentDeviceAccess = {allowed:false,device:null};
  let deviceListCache = [];
  let employeeMobileView = "employeeToday";
  let employeeCalendarIndex = getCurrentMonthIndex();
  let employeeCalendarSelectedDate = moscowParts().date;
  let desktopCalendarIndex = getCurrentMonthIndex();
  let desktopCalendarSelectedDate = moscowParts().date;
  let serviceScheduleSelectedDate = moscowParts().date;

  const $ = id => document.getElementById(id);
  const monthSelect = $("monthSelect");
  const yearSelect = $("yearSelect");
  const employeeFilter = $("employeeFilter");


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


  const errorJournal=(window.MAErrors && typeof window.MAErrors.create==="function")
    ? window.MAErrors.create({
        storageKey:ERROR_LOG_KEY,
        maxEntries:50,
        getContext:()=>({
          path:String(location.pathname||"/"),
          online:navigator.onLine!==false,
          mode:isAdmin()?"admin":(isServiceDeviceMode()?"service":"employee"),
          service:serviceDeviceName()||"",
          viewport:`${window.innerWidth||0}x${window.innerHeight||0}`
        })
      })
    : null;

  function appErrorEntries(){
    try{ return errorJournal?.list?.() || []; }catch(_){ return []; }
  }

  function logAppError(scope,error,meta={}){
    try{ console.error(`[MA График · ${scope}]`,error,meta); }catch(_){ }
    let entry=null;
    try{ entry=errorJournal?.log?.(scope,error,meta) || null; }catch(_){ }
    try{
      const page=$("settingsPage");
      if(page && !page.classList.contains("hidden")){
        renderErrorLog();
        updateSettingsSystemStatus();
      }
    }catch(_){ }
    return entry;
  }

  function errorTimeLabel(value){
    const ms=Date.parse(value||"");
    if(!ms) return "—";
    try{
      return new Intl.DateTimeFormat("ru-RU",{
        timeZone:SHIFT_TIMEZONE,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
      }).format(new Date(ms));
    }catch(_){ return String(value||"—"); }
  }

  function renderErrorLog(){
    const root=$("errorLogList");
    if(!root) return;
    const entries=appErrorEntries();
    const badge=$("errorLogCountBadge");
    if(badge) badge.textContent=entries.length ? `(${entries.length})` : "";
    if(!entries.length){
      root.innerHTML='<div class="error-log-empty">Ошибок не зафиксировано.</div>';
      return;
    }
    root.innerHTML=entries.slice(0,20).map(entry=>{
      const repeat=Number(entry.count||1)>1 ? ` · ×${Number(entry.count)}` : "";
      const scope=escapeHtml(entry.scope||"error");
      const message=escapeHtml(entry.message||"Неизвестная ошибка");
      return `<div class="error-log-item">
        <div class="error-log-head"><b>${scope}</b><span>${escapeHtml(errorTimeLabel(entry.lastAt||entry.at))}${repeat}</span></div>
        <div class="error-log-message">${message}</div>
      </div>`;
    }).join("");
  }

  async function copyErrorLog(){
    const text=errorJournal?.formatText?.() || "MA График — журнал ошибок недоступен.";
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
      }else{
        const area=document.createElement("textarea");
        area.value=text; area.setAttribute("readonly","");
        area.style.position="fixed"; area.style.opacity="0";
        document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      toast("Журнал ошибок скопирован");
    }catch(e){
      logAppError("error log copy",e);
      toast("Не удалось скопировать журнал");
    }
  }

  function clearErrorLog(){
    try{ errorJournal?.clear?.(); }catch(_){ }
    renderErrorLog();
    updateSettingsSystemStatus();
    toast("Журнал ошибок очищен");
  }

  const copyErrorLogBtn=$("copyErrorLogBtn");
  if(copyErrorLogBtn) copyErrorLogBtn.onclick=copyErrorLog;
  const clearErrorLogBtn=$("clearErrorLogBtn");
  if(clearErrorLogBtn) clearErrorLogBtn.onclick=clearErrorLog;

  window.addEventListener("error",event=>{
    try{
      if(event.target && event.target!==window){
        const target=event.target;
        const resource=String(target.src||target.href||"").split("?")[0];
        logAppError("resource load",new Error("Не удалось загрузить ресурс"),{
          tag:String(target.tagName||"resource"),resource
        });
        return;
      }
      logAppError("window error",event.error||new Error(event.message||"Необработанная ошибка"),{
        file:String(event.filename||"").split("?")[0],line:event.lineno||0,column:event.colno||0
      });
    }catch(_){ }
  },true);

  window.addEventListener("unhandledrejection",event=>{
    try{ logAppError("unhandled promise",event.reason||new Error("Необработанная ошибка Promise")); }catch(_){ }
  });

  function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function stableJson(value){
    try{ return JSON.stringify(value); }catch(e){ return ""; }
  }

  function beginButtonBusy(id,busyText="Сохраняем…"){
    const btn=$(id);
    if(!btn || btn.dataset.busy==="1") return null;
    const state={btn,text:btn.textContent,disabled:btn.disabled};
    btn.dataset.busy="1";
    btn.disabled=true;
    if(busyText) btn.textContent=busyText;
    return state;
  }

  function endButtonBusy(state){
    if(!state?.btn) return;
    state.btn.dataset.busy="";
    state.btn.disabled=state.disabled;
    state.btn.textContent=state.text;
  }

  function serviceKeyForName(name,s=null){
    const cfg=s || settings;
    if(name===cfg.service1) return "s1";
    if(name===cfg.service2) return "s2";
    return "";
  }

  function serviceNameForKey(key,s=null){
    const cfg=s || settings;
    if(key==="s1") return cfg.service1;
    if(key==="s2") return cfg.service2;
    return "";
  }

  function loadCachedTodayShifts(){
    try{
      const raw=JSON.parse(localStorage.getItem(TODAY_SHIFT_CACHE_KEY)||"null");
      const today=moscowParts().date;
      if(raw?.date!==today || !Array.isArray(raw.rows)) return [];
      return raw.rows;
    }catch(e){ return []; }
  }

  function saveCachedTodayShifts(date,rows){
    try{
      localStorage.setItem(TODAY_SHIFT_CACHE_KEY,JSON.stringify({
        date,
        savedAt:Date.now(),
        rows:Array.isArray(rows)?rows:[]
      }));
    }catch(e){}
  }

  function canUseShiftService(service){
    if(isAdmin()) return true;
    return !!(
      currentDeviceAccess.allowed &&
      currentDeviceAccess.device &&
      currentDeviceAccess.device.service===service &&
      currentDeviceAccess.verified!==false
    );
  }

  function dateObjectFromKey(dateStr){
    const [y,m,d]=String(dateStr||moscowParts().date).split("-").map(Number);
    return new Date(y,m-1,d);
  }

  function isPhoneLike(){
    return window.matchMedia("(max-width: 760px)").matches ||
      /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent||"");
  }
  function isEmployeePhoneMode(){
    return !isAdmin() && !currentDeviceAccess.allowed && isPhoneLike();
  }
  function isServiceDeviceMode(){
    return !isAdmin() && !!(currentDeviceAccess.allowed && currentDeviceAccess.device);
  }
  function serviceDeviceName(){
    return isServiceDeviceMode() ? currentDeviceAccess.device.service : "";
  }
  function openEmployeePicker(){
    if(!isEmployeePhoneMode()) return;
    const grid=$("employeePickerGrid");
    grid.innerHTML=activeEmployeeNames().map(n=>`<button class="employee-picker-btn" data-employee="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("");
    grid.querySelectorAll(".employee-picker-btn").forEach(btn=>{
      btn.onclick=()=>{
        saveEmployeeName(btn.dataset.employee);
        $("employeePickerModal").classList.add("hidden");
        renderEmployeePages();
        switchTab("employeeToday");
      };
    });
    $("employeePickerModal").classList.remove("hidden");
  }
  function ensureEmployeeSelected(){
    if(isEmployeePhoneMode() && !selectedEmployee()) openEmployeePicker();
  }

  function restoreScrollAfterRender(scrollY){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        window.scrollTo({top:scrollY,left:0,behavior:"auto"});
      });
    });
  }

  // Supabase connection checks are provided by supabase.js
  function setCloudStatus(text,kind=""){
    const badge=$("saveBadge");
    badge.textContent=text;
    badge.classList.remove("online","offline","syncing");
    if(kind) badge.classList.add(kind);

    const banner=$("connectionBanner");
    if(banner){
      const shouldShow=cloudConfigured() && (kind==="offline" || navigator.onLine===false);
      banner.classList.toggle("show",shouldShow);
      banner.textContent="Нет связи — данные могут быть неактуальны.";
    }
  }

  function updateCloudSettingsState(){
    const el=$("cloudSettingsState");
    if(el){
      if(!cloudConfigured()){
        el.innerHTML='<div class="settings-account-status"><b>Администратор</b> · облако не настроено</div>';
      }else if(isAdmin()){
        el.innerHTML='<div class="settings-account-status"><b>Администратор ✓</b> · общий график можно изменять</div>';
      }else{
        el.innerHTML='<div class="settings-account-status"><b>Режим просмотра</b> · войдите как администратор для изменений</div>';
      }
    }
    if($("logoutBtn")) $("logoutBtn").disabled=!isAdmin();
    updateSettingsSystemStatus();
  }

  function setSystemHealth(iconId,textId,state,text){
    const icon=$(iconId), label=$(textId);
    if(icon){
      icon.classList.remove("ok","warn","bad");
      if(state) icon.classList.add(state);
    }
    if(label) label.textContent=text;
  }

  function updateSettingsSystemStatus(){
    if(!$("systemCloudText")) return;

    if($("systemS1Name")) $("systemS1Name").textContent=settings.service1;
    if($("systemS2Name")) $("systemS2Name").textContent=settings.service2;

    if(!cloudConfigured()){
      setSystemHealth("systemCloudIcon","systemCloudText","bad","Не подключено");
    }else if(navigator.onLine===false){
      setSystemHealth("systemCloudIcon","systemCloudText","warn","Нет связи");
    }else{
      setSystemHealth("systemCloudIcon","systemCloudText","ok","Подключено");
    }

    if(!("Notification" in window)){
      setSystemHealth("systemPushIcon","systemPushText","warn","Недоступны");
    }else if(Notification.permission==="granted"){
      setSystemHealth("systemPushIcon","systemPushText","ok","Включены");
    }else if(Notification.permission==="denied"){
      setSystemHealth("systemPushIcon","systemPushText","bad","Запрещены");
    }else{
      setSystemHealth("systemPushIcon","systemPushText","warn","Не включены");
    }

    const active=(deviceListCache||[]).filter(d=>d.active);
    const s1Device=active.find(d=>d.service===settings.service1);
    const s2Device=active.find(d=>d.service===settings.service2);

    if(!isAdmin() && !active.length){
      setSystemHealth("systemS1Icon","systemS1Text","warn","Нужен вход администратора");
      setSystemHealth("systemS2Icon","systemS2Text","warn","Нужен вход администратора");
    }else if(isAdmin() && deviceListLoadState==="error"){
      setSystemHealth("systemS1Icon","systemS1Text","warn","Не удалось проверить");
      setSystemHealth("systemS2Icon","systemS2Text","warn","Не удалось проверить");
    }else if(isAdmin() && deviceListLoadState!=="ok" && !active.length){
      setSystemHealth("systemS1Icon","systemS1Text","warn","Проверяем…");
      setSystemHealth("systemS2Icon","systemS2Text","warn","Проверяем…");
    }else{
      setSystemHealth(
        "systemS1Icon","systemS1Text",
        s1Device?"ok":"bad",
        s1Device ? (s1Device.label||"Устройство подключено") : "Нет активного устройства"
      );
      setSystemHealth(
        "systemS2Icon","systemS2Text",
        s2Device?"ok":"bad",
        s2Device ? (s2Device.label||"Устройство подключено") : "Нет активного устройства"
      );
    }


    const errorEntries=appErrorEntries();
    if(!errorEntries.length){
      setSystemHealth("systemErrorsIcon","systemErrorsText","ok","Ошибок не зафиксировано");
    }else{
      const latest=errorEntries[0];
      setSystemHealth(
        "systemErrorsIcon","systemErrorsText","warn",
        `${errorEntries.length} записей · последняя ${errorTimeLabel(latest.lastAt||latest.at)}`
      );
    }
  }

  function updateCurrentScheduleSummary(){
    const root=$("currentScheduleSummary");
    if(!root) return;

    const today=dateObjectFromKey(moscowParts().date);
    if(!balancedRosterState(today)){
      root.innerHTML=`<div class="current-schedule-card" style="grid-column:1/-1">
        <h3>Индивидуальный график</h3>
        <div class="current-schedule-row">Текущая команда уже не совпадает с автоматической схемой. Актуальные смены смотрите в разделе <b>График</b>.</div>
      </div>`;
      return;
    }

    const todayKey=dateKeyFromDate(today);
    const tempMasterNotice=(todayKey>=MASTER_ROSTER_FROM && todayKey<=MASTER_TEMP_TO)
      ? `<div class="current-schedule-card" style="grid-column:1/-1;border-color:#f1d79e;background:#fffaf0">
          <h3>Временный график мастеров · 24–31 августа</h3>
          <div class="current-schedule-row">Олег в отпуске. Георгий и Асик работают по временному графику, у каждого по одному выходному. С 1 сентября возвращается постоянный цикл.</div>
        </div>`
      : "";

    root.innerHTML=`
      ${tempMasterNotice}
      <div class="current-schedule-card service-s1">
        <h3>${escapeHtml(settings.service1)}</h3>
        <div class="current-schedule-row"><b>Менеджеры:</b> Арсен / Дина — 2/2, только в этой точке</div>
        <div class="current-schedule-row"><b>Мастер:</b> Олег — Пн–Пт</div>
        <div class="current-schedule-row"><b>Сб и Вс:</b> Георгий / Асик работают по очереди неделями</div>
        <div class="current-schedule-row"><b>На смене:</b> 1 менеджер + 1 мастер · 08:00–22:00</div>
      </div>

      <div class="current-schedule-card service-s2">
        <h3>${escapeHtml(settings.service2)}</h3>
        <div class="current-schedule-row"><b>Отдельного менеджера нет.</b></div>
        <div class="current-schedule-row"><b>Мастер:</b> Георгий / Асик — по действующему двухнедельному циклу</div>
        <div class="current-schedule-row"><b>Ответственный:</b> мастер Новы одновременно выполняет функцию менеджера</div>
        <div class="current-schedule-row"><b>Смена:</b> 09:00–19:00 · мастер открывает и закрывает её своим PIN</div>
      </div>
    `;
  }

  function updateDesktopNavBrand(mode="admin",service=""){
    const title=$("desktopNavBrandTitle");
    const subtitle=$("desktopNavBrandSubtitle");
    if(!title || !subtitle) return;

    if(mode==="service"){
      title.textContent=service || "MA График";
      subtitle.textContent="Рабочее устройство точки";
    }else if(mode==="employee"){
      title.textContent="MA График";
      subtitle.textContent="График сотрудника";
    }else{
      title.textContent="MA График";
      subtitle.textContent="Управление сменами";
    }
  }



  // ---------- Кошельки ----------
  function saveWalletState(){
    localStorage.setItem(WALLET_STORAGE_KEY,JSON.stringify(walletState));
  }

  function setWalletCloudState(state,text){
    const el=$("walletCloudState");
    if(!el) return;
    el.classList.remove("ok","warn","bad");
    if(state) el.classList.add(state);
    const fullText=String(text||"");
    if(state==="ok"){
      el.textContent="●";
      el.title=fullText||"Облако синхронизировано";
      el.setAttribute("aria-label",el.title);
    }else{
      el.textContent=fullText;
      el.title="";
      el.removeAttribute("aria-label");
    }
  }

  function currentAdminUserId(){
    const direct=adminSession?.user?.id;
    if(direct) return String(direct);
    try{
      const token=String(adminSession?.access_token||"");
      const payload=token.split(".")[1];
      if(!payload) return "";
      const normalized=payload.replace(/-/g,"+").replace(/_/g,"/");
      const json=decodeURIComponent(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,"=")).split("").map(c=>"%"+("00"+c.charCodeAt(0).toString(16)).slice(-2)).join(""));
      return String(JSON.parse(json)?.sub||"");
    }catch(e){ return ""; }
  }

  function walletCloudTableMissing(errorText){
    const text=String(errorText||"").toLowerCase();
    return text.includes("ma_wallet_config") || text.includes("ma_wallet_plans") || text.includes("ma_wallet_transactions") || text.includes("effective_at") || text.includes("history_cleared_at") || text.includes("ma_wallet_apply_batch") || text.includes("ma_wallet_clear_history") || text.includes("pgrst205") || text.includes("42p01") || text.includes("could not find the table") || text.includes("could not find the function");
  }

  function walletTransactionPayload(t,ownerId){
    return {
      id:t.id,owner_id:ownerId,operation_id:t.operationId,type:t.type,wallet_id:t.walletId,
      amount_cents:t.amountCents,comment:t.comment||"",created_at:t.createdAt,effective_at:t.effectiveAt||t.createdAt,
      reversal_of_transaction_id:t.reversalOfTransactionId||"",
      reverses_operation_id:t.reversesOperationId||"",source_type:t.sourceType||""
    };
  }

  function walletTransactionFromCloud(row){
    return normalizeWalletTransaction({
      id:String(row.id||""),operationId:String(row.operation_id||""),type:String(row.type||""),walletId:String(row.wallet_id||""),
      amountCents:Number(row.amount_cents),comment:String(row.comment||""),createdAt:String(row.created_at||new Date().toISOString()),effectiveAt:String(row.effective_at||row.created_at||new Date().toISOString()),
      reversalOfTransactionId:String(row.reversal_of_transaction_id||""),reversesOperationId:String(row.reverses_operation_id||""),sourceType:String(row.source_type||"")
    });
  }

  async function fetchWalletCloudTransactions(token){
    const rows=[];
    for(let offset=0;offset<WALLET_CLOUD_MAX_ROWS;offset+=WALLET_CLOUD_PAGE_SIZE){
      const path=`/rest/v1/${WALLET_TX_TABLE}?select=id,operation_id,type,wallet_id,amount_cents,comment,created_at,effective_at,reversal_of_transaction_id,reverses_operation_id,source_type&order=created_at.asc,id.asc&limit=${WALLET_CLOUD_PAGE_SIZE}&offset=${offset}`;
      const res=await authFetch(path,{method:"GET",headers:{Authorization:"Bearer "+token}});
      if(!res.ok) throw await httpErrorFromResponse(res,"Не удалось загрузить кошельки");
      const part=await res.json().catch(()=>[]);
      rows.push(...part);
      if(part.length<WALLET_CLOUD_PAGE_SIZE) return rows;
    }
    throw new Error(`История кошельков превысила безопасный лимит ${WALLET_CLOUD_MAX_ROWS} строк. Синхронизация остановлена, чтобы не посчитать баланс по неполным данным.`);
  }

  async function fetchWalletCloudPlans(token){
    const res=await authFetch(`/rest/v1/${WALLET_PLAN_TABLE}?select=plans,updated_at&limit=1`,{method:"GET",headers:{Authorization:"Bearer "+token}});
    if(!res.ok) throw await httpErrorFromResponse(res,"Не удалось загрузить старые планы кошельков");
    return await res.json().catch(()=>[]);
  }

  async function fetchWalletCloudConfig(token){
    const res=await authFetch(`/rest/v1/${WALLET_CONFIG_TABLE}?select=wallets,strategy,last_rollover_month,history_cleared_at,updated_at&limit=1`,{method:"GET",headers:{Authorization:"Bearer "+token}});
    if(!res.ok) throw await httpErrorFromResponse(res,"Не удалось загрузить настройки кошельков");
    return await res.json().catch(()=>[]);
  }

  async function uploadWalletTransactions(token,ownerId,transactions){
    if(!transactions.length) return;
    const chunkSize=200;
    for(let i=0;i<transactions.length;i+=chunkSize){
      const body=transactions.slice(i,i+chunkSize).map(t=>walletTransactionPayload(t,ownerId));
      const res=await authFetch(`/rest/v1/${WALLET_TX_TABLE}?on_conflict=id`,{
        method:"POST",
        headers:{Authorization:"Bearer "+token,Prefer:"resolution=ignore-duplicates,return=minimal"},
        body:JSON.stringify(body)
      });
      if(!res.ok) throw new Error(await res.text());
    }
  }

  function walletLegacyPlansObject(state=walletState){
    const ids=new Set(["products","pocket","restaurant","vacation","savings","clothes","children","self"]);
    const result={};
    state.wallets.forEach(w=>{ if(ids.has(w.id)) result[w.id]=Math.max(0,Math.trunc(w.monthlyPlanCents||0)); });
    ids.forEach(id=>{ if(!(id in result)) result[id]=0; });
    return result;
  }

  async function uploadWalletLegacyPlans(token,ownerId,state=walletState){
    const stamp=state.configUpdatedAt||new Date().toISOString();
    const res=await authFetch(`/rest/v1/${WALLET_PLAN_TABLE}?on_conflict=owner_id`,{
      method:"POST",
      headers:{Authorization:"Bearer "+token,Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({owner_id:ownerId,plans:walletLegacyPlansObject(state),updated_at:stamp})
    });
    if(!res.ok) throw new Error(await res.text());
  }

  async function uploadWalletConfig(token,ownerId,state=walletState){
    const res=await authFetch(`/rest/v1/${WALLET_CONFIG_TABLE}?on_conflict=owner_id`,{
      method:"POST",
      headers:{Authorization:"Bearer "+token,Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({owner_id:ownerId,wallets:state.wallets,strategy:state.strategy,last_rollover_month:state.lastRolloverMonth||walletCurrentMonthKey(),history_cleared_at:state.historyClearedAt||null,updated_at:state.configUpdatedAt||new Date().toISOString()})
    });
    if(!res.ok) throw new Error(await res.text());
    // Старые версии приложения продолжают видеть планы встроенных кошельков.
    await uploadWalletLegacyPlans(token,ownerId,state);
  }

  function mergeWalletTransactionLists(localList,remoteList){
    const map=new Map();
    remoteList.forEach(t=>{ if(t) map.set(t.id,t); });
    localList.forEach(t=>{ if(t && !map.has(t.id)) map.set(t.id,t); });
    return [...map.values()].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
  }

  function walletStateFromCloudConfig(row,transactions){
    return normalizeWalletState({
      version:WALLET_DATA_VERSION,
      wallets:Array.isArray(row?.wallets)?row.wallets:[],
      strategy:row?.strategy||"proportional",
      configUpdatedAt:row?.updated_at||"",
      historyClearedAt:row?.history_cleared_at||"",
      lastRolloverMonth:row?.last_rollover_month||walletCurrentMonthKey(),
      transactions
    });
  }

  function applyLegacyPlanRowToState(state,row){
    if(!row || !row.plans || typeof row.plans!=="object") return state;
    const next=clone(state);
    Object.entries(row.plans).forEach(([id,value])=>{
      const w=next.wallets.find(x=>x.id===id && !x.systemRole);
      const n=Number(value);
      if(w && Number.isSafeInteger(n) && n>=0) w.monthlyPlanCents=n;
    });
    next.configUpdatedAt=String(row.updated_at||new Date().toISOString());
    return normalizeWalletState(next);
  }

  async function syncWalletsCloud(showToast=false,allowBusy=false){
    if(!cloudConfigured()){
      setWalletCloudState("warn","Облако: недоступно, данные сохранены на этом устройстве");
      return false;
    }
    if(!isAdmin()){
      setWalletCloudState("warn","Облако: войдите как администратор");
      return false;
    }
    if(walletBusy && !allowBusy) return false;
    const now=Date.now();
    if(!showToast && !allowBusy && now-lastWalletCloudFetchAt<10000) return true;
    if(walletCloudSyncPromise) return walletCloudSyncPromise;

    walletCloudSyncPromise=(async()=>{
      setWalletCloudState("warn","Облако: синхронизация…");
      try{
        const token=await getAdminToken();
        const ownerId=currentAdminUserId();
        if(!token || !ownerId) throw Object.assign(new Error("Сессия администратора закончилась"),{status:401});

        const [configRows,planRows,txRows]=await Promise.all([fetchWalletCloudConfig(token),fetchWalletCloudPlans(token),fetchWalletCloudTransactions(token)]);
        lastWalletCloudFetchAt=Date.now();
        walletCloudNeedsSetup=false;

        const remoteConfig=configRows[0]||null;
        const legacyPlan=planRows[0]||null;
        const localClearMs=Date.parse(walletState.historyClearedAt||"")||0;
        const remoteClearMs=Date.parse(remoteConfig?.history_cleared_at||"")||0;
        const effectiveClearMs=Math.max(localClearMs,remoteClearMs);
        const effectiveClearAt=effectiveClearMs?new Date(effectiveClearMs).toISOString():"";

        // Важная защита нескольких устройств: после полной очистки старое устройство
        // не имеет права снова загрузить операции, созданные до серверной отметки очистки.
        if(effectiveClearMs){
          const before=walletState.transactions.length;
          walletState.historyClearedAt=effectiveClearAt;
          walletState.transactions=walletState.transactions.filter(t=>(Date.parse(t.createdAt)||0)>effectiveClearMs);
          if(walletState.transactions.length!==before || localClearMs!==effectiveClearMs) saveWalletState();
        }

        const remoteTransactions=txRows.map(walletTransactionFromCloud).filter(Boolean)
          .filter(t=>!effectiveClearMs || (Date.parse(t.createdAt)||0)>effectiveClearMs);
        const remoteIds=new Set(remoteTransactions.map(t=>t.id));
        const missingInCloud=walletState.transactions.filter(t=>!remoteIds.has(t.id));
        if(missingInCloud.length) await uploadWalletTransactions(token,ownerId,missingInCloud);
        const mergedTransactions=mergeWalletTransactionLists(walletState.transactions,remoteTransactions);

        let nextState=normalizeWalletState({...walletState,historyClearedAt:effectiveClearAt||walletState.historyClearedAt,transactions:mergedTransactions});
        const localTime=Date.parse(nextState.configUpdatedAt||"")||0;
        const remoteTime=Date.parse(remoteConfig?.updated_at||"")||0;
        const legacyTime=Date.parse(legacyPlan?.updated_at||"")||0;

        if(remoteConfig){
          const remoteState=walletStateFromCloudConfig(remoteConfig,mergedTransactions);
          // Никогда не теряем более новую отметку полной очистки.
          remoteState.historyClearedAt=effectiveClearAt||remoteState.historyClearedAt;
          if(legacyTime>Math.max(remoteTime,localTime)){
            nextState=applyLegacyPlanRowToState(remoteState,legacyPlan);
            nextState.historyClearedAt=effectiveClearAt||nextState.historyClearedAt;
            nextState.transactions=mergedTransactions;
            await uploadWalletConfig(token,ownerId,nextState);
          }else if(localTime>remoteTime || localClearMs>remoteClearMs){
            await uploadWalletConfig(token,ownerId,nextState);
          }else{
            nextState=remoteState;
            nextState.transactions=mergedTransactions;
          }
        }else{
          if(legacyPlan && legacyTime>localTime) nextState=applyLegacyPlanRowToState(nextState,legacyPlan);
          if(!nextState.configUpdatedAt) nextState.configUpdatedAt=new Date().toISOString();
          nextState.historyClearedAt=effectiveClearAt||nextState.historyClearedAt;
          nextState.transactions=mergedTransactions;
          await uploadWalletConfig(token,ownerId,nextState);
        }

        walletState=normalizeWalletState(nextState);
        saveWalletState();
        await maybeApplyWalletMonthRollover(token,ownerId);
        if(!$("walletsPage").classList.contains("hidden")) renderWallets();
        setWalletCloudState("ok","Облако: синхронизировано");
        if(showToast) toast("Кошельки обновлены из облака");
        return true;
      }catch(e){
        logAppError("wallet cloud sync",e);
        const text=String(e?.message||e||"");
        const info=classifySyncError(e);
        if(walletCloudTableMissing(text)){
          walletCloudNeedsSetup=true;
          setWalletCloudState("bad","Облако кошельков: требуется обновление Supabase");
          if(showToast) toast("Сначала выполните supabase_fix.sql");
        }else if(info.kind==="offline"){
          setWalletCloudState("warn","Облако: нет интернета, изменения сохранены локально");
          if(showToast) toast("Нет интернета. Кошельки сохранены на этом устройстве");
        }else if(info.kind==="auth"){
          setWalletCloudState("bad","Облако: сессия администратора закончилась");
          if(Number(e?.status)===401 && adminSession) saveAdminSession(null);
          if(showToast) toast("Войдите как администратор заново");
        }else if(info.kind==="forbidden"){
          setWalletCloudState("bad","Облако: нет доступа к данным кошельков");
          if(showToast) toast("Supabase отклонил доступ к кошелькам");
        }else if(info.kind==="temporary"){
          setWalletCloudState("warn","Облако: временный сбой, повторим автоматически");
          if(showToast) toast("Временная ошибка облака. Повторим автоматически");
        }else{
          setWalletCloudState("warn","Облако: ошибка синхронизации");
          if(showToast) toast("Не удалось синхронизировать кошельки");
        }
        return false;
      }
    })();

    try{ return await walletCloudSyncPromise; }
    finally{ walletCloudSyncPromise=null; }
  }

  function walletDefinitions({includeArchived=true}={}){
    const list=walletState.wallets.slice().sort((a,b)=>a.order-b.order || a.name.localeCompare(b.name,"ru"));
    return includeArchived?list:list.filter(w=>!w.archived);
  }

  function walletDef(id){ return walletState.wallets.find(w=>w.id===id)||null; }
  function walletInsurance(){ return walletState.wallets.find(w=>w.systemRole==="insurance") || walletDef("insurance"); }
  function walletActive(){ return walletDefinitions({includeArchived:false}); }
  function walletBalance(id){
    return walletState.transactions.reduce((sum,t)=>sum+(t.walletId===id?t.amountCents:0),0);
  }

  function walletBalanceAtMonth(id,monthKey){
    return walletState.transactions.reduce((sum,t)=>{
      if(t.walletId!==id) return sum;
      return walletTransactionMonth(t)<=monthKey?sum+t.amountCents:sum;
    },0);
  }

  function walletTotalBalanceAtMonth(monthKey){
    return walletDefinitions().reduce((sum,w)=>sum+walletBalanceAtMonth(w.id,monthKey),0);
  }

  function walletMonthMetrics(monthKey,walletId=""){
    let received=0,distributed=0,toppedUp=0,spent=0,allocated=0;
    walletState.transactions.forEach(t=>{
      if(walletId && t.walletId!==walletId) return;
      if(walletTransactionMonth(t)!==monthKey) return;
      const source=t.type==="reversal"?t.sourceType:t.type;
      if(source==="distribution"){
        received+=t.amountCents;
        distributed+=t.amountCents;
        allocated+=t.amountCents;
      }else if(source==="topup"){
        received+=t.amountCents;
        toppedUp+=t.amountCents;
        allocated+=t.amountCents;
      }else if(source==="expense"){
        spent+=-t.amountCents;
      }
    });
    return {received:Math.max(0,received),distributed:Math.max(0,distributed),toppedUp:Math.max(0,toppedUp),spent:Math.max(0,spent),allocated:Math.max(0,allocated)};
  }

  function walletMonthFlow(monthKey,walletId){
    let incoming=0,outgoing=0;
    walletState.transactions.forEach(t=>{
      if(t.walletId!==walletId || walletTransactionMonth(t)!==monthKey) return;
      if(t.amountCents>0) incoming+=t.amountCents;
      else outgoing+=-t.amountCents;
    });
    return {incoming:Math.max(0,incoming),outgoing:Math.max(0,outgoing)};
  }

  function walletMonthAllocated(id,monthKey=walletCurrentMonthKey()){
    return walletMonthMetrics(monthKey,id).allocated;
  }

  function walletOperationGroups(){
    const map=new Map();
    walletState.transactions.forEach(t=>{
      if(!map.has(t.operationId)) map.set(t.operationId,{operationId:t.operationId,items:[],createdAt:t.createdAt,effectiveAt:t.effectiveAt||t.createdAt,type:t.type,comment:t.comment||"",sourceType:t.sourceType||"",reversesOperationId:t.reversesOperationId||""});
      const g=map.get(t.operationId);
      g.items.push(t);
      if(String(t.createdAt)>String(g.createdAt)) g.createdAt=t.createdAt;
    });
    return [...map.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function walletReversedOperationIds(){
    return new Set(walletState.transactions.filter(t=>t.type==="reversal" && t.reversesOperationId).map(t=>t.reversesOperationId));
  }

  function walletOperationTitle(group){
    if(group.type==="distribution") return "Распределение";
    if(group.type==="topup") return "Пополнение";
    if(group.type==="expense") return "Расход";
    if(group.type==="transfer") return "Перевод";
    if(group.type==="auto_carryover") return "Перенос остатка";
    if(group.type==="correction") return "Корректировка";
    if(group.type==="reversal"){
      if(group.sourceType==="distribution") return "Отмена распределения";
      if(group.sourceType==="topup") return "Отмена пополнения";
      if(group.sourceType==="expense") return "Отмена расхода";
      if(group.sourceType==="transfer") return "Отмена перевода";
      if(group.sourceType==="auto_carryover") return "Отмена переноса";
    }
    return "Отмена операции";
  }

  function formatWalletDate(iso){
    try{
      return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:SHIFT_TIMEZONE}).format(new Date(iso));
    }catch(e){ return iso||"—"; }
  }

  function walletOperationSummary(group){
    const items=group.items;
    if(group.type==="transfer" || group.type==="auto_carryover"){
      const from=items.find(t=>t.amountCents<0),to=items.find(t=>t.amountCents>0);
      return `${walletDef(from?.walletId)?.name||"Кошелёк"} → ${walletDef(to?.walletId)?.name||"Кошелёк"}`;
    }
    if(group.type==="reversal" && ["transfer","auto_carryover"].includes(group.sourceType)){
      // В reversal знаки обратные исходной операции: плюс — исходный источник, минус — исходное назначение.
      const originalFrom=items.find(t=>t.amountCents>0),originalTo=items.find(t=>t.amountCents<0);
      return `${walletDef(originalFrom?.walletId)?.name||"Кошелёк"} → ${walletDef(originalTo?.walletId)?.name||"Кошелёк"}`;
    }
    if(items.length===1) return walletDef(items[0].walletId)?.name||"Кошелёк";
    return `${items.length} кошельков`;
  }

  function walletOperationDisplayAmount(group){
    if(group.type==="transfer" || group.type==="auto_carryover"){
      const out=group.items.find(t=>t.amountCents<0);
      return out?formatMoney(Math.abs(out.amountCents)):formatMoney(0);
    }
    if(group.type==="reversal" && ["transfer","auto_carryover"].includes(group.sourceType)){
      const leg=group.items.find(t=>t.amountCents!==0);
      return leg?formatMoney(Math.abs(leg.amountCents)):formatMoney(0);
    }
    const total=group.items.reduce((sum,t)=>sum+t.amountCents,0);
    if(group.type==="reversal") return formatMoney(Math.abs(total));
    return formatMoney(total,{signed:true});
  }

  function walletHistoryMatches(group){
    const month=$("walletHistoryMonth")?.value||walletViewMonthKey;
    const type=$("walletHistoryType")?.value||"all";
    const walletId=$("walletHistoryWallet")?.value||"all";
    const gMonth=walletMonthKeyFromIso(group.effectiveAt||group.createdAt);
    const effectiveType=group.type==="reversal"?(group.sourceType||"reversal"):group.type;
    if(month!=="all" && gMonth!==month) return false;
    if(walletId!=="all" && !group.items.some(t=>t.walletId===walletId)) return false;
    if(type==="income" && !["distribution","topup"].includes(effectiveType)) return false;
    if(type==="expense" && effectiveType!=="expense") return false;
    if(type==="transfer" && !["transfer","auto_carryover"].includes(effectiveType)) return false;
    return true;
  }

  function renderWalletHistoryList(root,limit=0,{filtered=false}={}){
    if(!root) return;
    let groups=walletOperationGroups();
    if(filtered) groups=groups.filter(walletHistoryMatches);
    if(limit>0) groups=groups.slice(0,limit);
    if(!groups.length){ root.innerHTML='<div class="wallet-empty">Операций пока нет.</div>'; return; }
    const reversed=walletReversedOperationIds();

    root.innerHTML=groups.map(g=>{
      const effectiveType=g.type==="reversal"?(g.sourceType||"reversal"):g.type;
      const cls=g.type==="reversal" || ["transfer","auto_carryover"].includes(effectiveType)?"neutral":(effectiveType==="expense"?"out":"in");
      const comment=g.items[0]?.comment?` · ${escapeHtml(g.items[0].comment)}`:"";
      const details=g.items.length>1 ? `<div class="wallet-history-details">${g.items.map(t=>`<div class="wallet-history-detail-row"><span>${escapeHtml(walletDef(t.walletId)?.name||t.walletId)}</span><b>${formatMoney(t.amountCents,{signed:true})}</b></div>`).join("")}</div>` : "";
      const canEdit=g.type!=="reversal" && !reversed.has(g.operationId) && ["distribution","topup","expense","transfer"].includes(g.type);
      const operationMonth=walletMonthKeyFromIso(g.effectiveAt||g.createdAt);
      const canUndo=canEdit && operationMonth===walletCurrentMonthKey();
      const actions=(canEdit||canUndo)?`<details class="wallet-history-menu"><summary aria-label="Действия">⋯</summary><div class="wallet-history-menu-actions">${canEdit?`<button class="secondary" data-wallet-correct="${escapeHtml(g.operationId)}">Исправить</button>`:""}${canUndo?`<button class="secondary" data-wallet-undo="${escapeHtml(g.operationId)}">Отменить</button>`:""}</div></details>`:"";
      return `<div class="wallet-history-item">
        <div class="wallet-history-row">
          <div class="wallet-history-main"><b>${walletOperationTitle(g)} · ${escapeHtml(walletOperationSummary(g))}</b><span>${escapeHtml(formatWalletDate(g.createdAt))}${comment}</span></div>
          <div class="wallet-history-amount ${cls}">${walletOperationDisplayAmount(g)}</div>
        </div>${details}${actions}
      </div>`;
    }).join("");
  }

  function calculateWalletDistribution(totalCents,monthKey=walletCurrentMonthKey()){
    totalCents=Math.max(0,Math.trunc(totalCents||0));
    const insurance=walletInsurance();
    const planned=walletActive().filter(w=>!w.systemRole && w.monthlyPlanCents>0).map((w,index)=>{
      const allocated=walletMonthAllocated(w.id,monthKey);
      const need=Math.max(0,Math.trunc(w.monthlyPlanCents)-allocated);
      return {id:w.id,name:w.name,plan:w.monthlyPlanCents,allocated,need,priority:w.priority,index};
    });
    const needTotal=planned.reduce((sum,x)=>sum+x.need,0);
    const allocations={};
    walletActive().forEach(w=>allocations[w.id]=0);
    if(insurance) allocations[insurance.id]=0;

    if(needTotal<=0){
      if(insurance) allocations[insurance.id]=totalCents;
      return {allocations,needTotal,totalCents,shortage:false,allPlansClosed:true,unconfigured:planned.length===0};
    }

    if(totalCents>=needTotal){
      planned.forEach(x=>allocations[x.id]=x.need);
      if(insurance) allocations[insurance.id]=totalCents-needTotal;
      return {allocations,needTotal,totalCents,shortage:false,allPlansClosed:false,unconfigured:false};
    }

    if(walletState.strategy==="priority"){
      let left=totalCents;
      planned.slice().sort((a,b)=>a.priority-b.priority || a.index-b.index).forEach(x=>{
        const part=Math.min(left,x.need);
        allocations[x.id]=part;left-=part;
      });
      if(insurance) allocations[insurance.id]=0;
      return {allocations,needTotal,totalCents,shortage:true,priority:true,allPlansClosed:false,unconfigured:false};
    }

    const totalBig=BigInt(totalCents), needTotalBig=BigInt(needTotal);
    const shares=planned.map((x,index)=>{
      const numerator=totalBig*BigInt(x.need);
      return {id:x.id,index,base:Number(numerator/needTotalBig),rem:numerator%needTotalBig};
    });
    shares.forEach(x=>allocations[x.id]=x.base);
    let remainder=totalCents-shares.reduce((sum,x)=>sum+x.base,0);
    shares.sort((a,b)=>a.rem===b.rem?a.index-b.index:(a.rem>b.rem?-1:1));
    for(let i=0;i<remainder;i++) allocations[shares[i%shares.length].id]+=1;
    if(insurance) allocations[insurance.id]=0;
    return {allocations,needTotal,totalCents,shortage:true,priority:false,allPlansClosed:false,unconfigured:false};
  }
  function appendWalletOperationsLocally(operations){
    const existing=new Set(walletState.transactions.map(t=>t.id));
    operations.forEach(op=>op.items.forEach(t=>{ if(!existing.has(t.id)){ walletState.transactions.push(t);existing.add(t.id); } }));
    walletState.transactions.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
    saveWalletState();
  }

  function createWalletOperation(type,entries,comment="",extra={}){
    const op=buildWalletOperation(type,entries,comment,extra);
    appendWalletOperationsLocally([op]);
    return op.operationId;
  }

  function walletRpcOperation(op){
    return {
      operation_id:op.operationId,type:op.type,comment:op.comment||"",created_at:op.createdAt,effective_at:op.effectiveAt,
      reverses_operation_id:op.reversesOperationId||"",source_type:op.sourceType||"",
      entries:op.items.map(t=>({id:t.id,wallet_id:t.walletId,amount_cents:t.amountCents,reversal_of_transaction_id:t.reversalOfTransactionId||""}))
    };
  }

  function walletViewingCurrentMonth(){ return walletViewMonthKey===walletCurrentMonthKey(); }
  function requireWalletCurrentMonth(){
    if(walletViewingCurrentMonth()) return true;
    toast("Это прошлый месяц. Новые операции создаются только в текущем месяце");
    return false;
  }

  function validateLocalWalletBatchBalances(operations){
    const deltas=new Map();
    operations.forEach(op=>op.items.forEach(t=>{
      deltas.set(t.walletId,(deltas.get(t.walletId)||0)+t.amountCents);
    }));
    for(const [walletId,delta] of deltas){
      const projected=walletBalance(walletId)+delta;
      if(projected<0){
        const name=walletDef(walletId)?.name||"Кошелёк";
        throw new Error(`Недостаточно денег в кошельке «${name}»`);
      }
    }
  }

  async function applyWalletBatchSafely(operations,{allowLocalWithoutCloud=true,skipSync=false}={}){
    const hasNegative=operations.some(op=>op.items.some(t=>t.amountCents<0));
    if(cloudConfigured()){
      if(!isAdmin()) throw new Error("Войдите как администратор");
      if(navigator.onLine===false) throw new Error(hasNegative?"Для списания денег требуется интернет, чтобы проверить актуальный баланс.":"Нет интернета");
      if(walletCloudNeedsSetup) throw new Error("Сначала выполните supabase_wallets_upgrade.sql");
      const token=await getAdminToken();
      const res=await authFetch(`/rest/v1/rpc/ma_wallet_apply_batch`,{
        method:"POST",headers:{Authorization:"Bearer "+token},body:JSON.stringify({p_operations:operations.map(walletRpcOperation)})
      });
      const text=await res.text();
      if(!res.ok){
        const low=text.toLowerCase();
        if(low.includes("wallet_insufficient_balance")) throw new Error("Баланс изменился на другом устройстве. Обновите данные.");
        if(walletCloudTableMissing(text)){ walletCloudNeedsSetup=true; throw new Error("Сначала выполните supabase_wallets_upgrade.sql"); }
        throw new Error(text||"Не удалось сохранить операцию");
      }
      appendWalletOperationsLocally(operations);
      if(!skipSync) await syncWalletsCloud(false,true);
      return true;
    }
    if(!allowLocalWithoutCloud && hasNegative) throw new Error("Для списания требуется подключённое облако");
    validateLocalWalletBatchBalances(operations);
    appendWalletOperationsLocally(operations);
    return true;
  }

  function walletGoalHtml(w,balance){
    if(w.type!=="savings" || !w.goalCents || w.systemRole) return "";
    const saved=Math.max(0,balance);
    if(saved>=w.goalCents) return `<div class="wallet-goal-compact good">✓ Цель ${formatMoney(w.goalCents)} достигнута</div>`;
    return `<div class="wallet-goal-compact">Цель: ${formatMoney(saved)} из ${formatMoney(w.goalCents)}</div>`;
  }

  function populateWalletHistoryFilters(){
    const select=$("walletHistoryWallet");
    if(select){
      const current=select.value||"all";
      select.innerHTML='<option value="all">Все кошельки</option>'+walletDefinitions().map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}${w.archived?" (архив)":""}</option>`).join("");
      select.value=[...select.options].some(o=>o.value===current)?current:"all";
    }
    const month=$("walletHistoryMonth");
    if(month){
      const keys=new Set([walletCurrentMonthKey(),walletViewMonthKey,...walletState.transactions.map(walletTransactionMonth)]);
      const sorted=[...keys].filter(k=>/^\d{4}-\d{2}$/.test(k)).sort().reverse();
      const current=month.value||walletViewMonthKey;
      month.innerHTML='<option value="all">Все месяцы</option>'+sorted.map(k=>`<option value="${k}">${escapeHtml(walletMonthLabel(k))}</option>`).join("");
      month.value=[...month.options].some(o=>o.value===current)?current:walletViewMonthKey;
    }
  }

  function walletPlanMonthSummary(monthKey=walletCurrentMonthKey()){
    const planned=walletActive().filter(w=>!w.systemRole && (w.monthlyPlanCents||0)>0);
    let totalPlan=0,allocatedToPlans=0,remaining=0;
    planned.forEach(w=>{
      const plan=Math.max(0,Math.trunc(w.monthlyPlanCents||0));
      const allocated=Math.max(0,walletMonthAllocated(w.id,monthKey));
      totalPlan+=plan;
      allocatedToPlans+=Math.min(plan,allocated);
      remaining+=Math.max(0,plan-allocated);
    });
    return {totalPlan,allocatedToPlans,remaining,count:planned.length,allClosed:planned.length>0&&remaining===0};
  }

  function setWalletOverviewStat(index,label,value){
    const l=$("walletOverviewStat"+index+"Label"),v=$("walletOverviewStat"+index+"Value");
    if(l) l.textContent=label;
    if(v) v.textContent=value;
  }

  function renderWalletMonthSummary(){
    const label=$("walletMonthLabel"); if(label) label.textContent=walletMonthLabel(walletViewMonthKey);
    const current=walletViewMonthKey===walletCurrentMonthKey();
    const m=walletMonthMetrics(walletViewMonthKey);
    const total=current?walletDefinitions().reduce((s,w)=>s+walletBalance(w.id),0):walletTotalBalanceAtMonth(walletViewMonthKey);
    const insurance=walletInsurance();
    const insuranceBalance=current?walletBalance(insurance?.id||"insurance"):walletBalanceAtMonth(insurance?.id||"insurance",walletViewMonthKey);
    $("walletsTotal").textContent=formatMoney(total);
    $("walletOverviewLabel").textContent=current?"Всего денег":"Баланс на конец месяца";
    const state=$("walletOverviewState");
    state.classList.remove("good","warn","neutral");

    state.classList.add("hidden");
    if(current){
      const p=walletPlanMonthSummary(walletViewMonthKey);
      setWalletOverviewStat(1,"План",formatMoney(p.totalPlan));
      setWalletOverviewStat(2,"Закрыто",formatMoney(p.allocatedToPlans));
      setWalletOverviewStat(3,"Осталось",formatMoney(p.remaining));
      setWalletOverviewStat(4,insurance?.name||"Страховка",formatMoney(insuranceBalance));
      if(!p.count){
        state.textContent="Планы месяца не заданы";state.classList.add("neutral");state.classList.remove("hidden");
      }else if(p.allClosed){
        state.textContent="✓ План месяца закрыт";state.classList.add("good");state.classList.remove("hidden");
      }
    }else{
      setWalletOverviewStat(1,"Получено",formatMoney(m.received));
      setWalletOverviewStat(2,"Распределено",formatMoney(m.distributed));
      setWalletOverviewStat(3,"Потрачено",formatMoney(m.spent));
      setWalletOverviewStat(4,insurance?.name||"Страховка",formatMoney(insuranceBalance));
      state.textContent="Исторический просмотр";state.classList.add("neutral");state.classList.remove("hidden");
    }
  }

  function walletPlanProgressHtml(w,mm){
    const plan=Math.max(0,w.monthlyPlanCents||0);
    if(!plan) return '<div class="wallet-card-plan">Без плана</div>';
    const allocated=Math.max(0,mm.allocated||0),left=Math.max(0,plan-allocated);
    const pct=Math.min(100,Math.max(0,Math.round((allocated/plan)*100)));
    return `<div class="wallet-card-plan-main"><div class="wallet-card-plan-line"><span>План ${formatMoney(plan)}</span><b>${left?`Осталось ${formatMoney(left)}`:"✓ Закрыт"}</b></div><div class="wallet-plan-progress"><i style="width:${pct}%"></i></div></div>`;
  }

  function renderWallets(){
    const grid=$("walletsGrid");
    if(!grid) return;
    if(!cloudConfigured()) setWalletCloudState("warn","Облако: недоступно, данные сохранены на этом устройстве");
    else if(!isAdmin()) setWalletCloudState("warn","Облако: войдите как администратор");
    else if(walletCloudNeedsSetup) setWalletCloudState("bad","Облако кошельков: требуется обновление Supabase");

    const currentMonth=walletViewMonthKey;
    const currentIsNow=currentMonth===walletCurrentMonthKey();
    renderWalletMonthSummary();

    const readonlyNote=$("walletReadonlyNote");
    if(readonlyNote) readonlyNote.classList.toggle("hidden",currentIsNow);
    const distributeBtn=$("openWalletDistribution"),transferBtn=$("openWalletTransfer"),nextBtn=$("walletMonthNext");
    if(distributeBtn) distributeBtn.disabled=!currentIsNow;
    if(transferBtn) transferBtn.disabled=!currentIsNow;
    if(nextBtn) nextBtn.disabled=currentIsNow;

    document.querySelectorAll("[data-wallet-filter]").forEach(btn=>btn.classList.toggle("active",btn.dataset.walletFilter===walletListFilter));
    const active=walletActive().filter(w=>walletListFilter==="all" || w.type===walletListFilter);
    grid.innerHTML=active.map(w=>{
      const balance=currentIsNow?walletBalance(w.id):walletBalanceAtMonth(w.id,currentMonth);
      const mm=walletMonthMetrics(currentMonth,w.id);
      const actionsDisabled=currentIsNow?"":" disabled";
      let mainPlan="";

      if(w.systemRole){
        mainPlan='<div class="wallet-card-plan">Свободный резерв</div>';
      }else if(!currentIsNow){
        mainPlan='<div class="wallet-card-plan">Исторический просмотр</div>';
      }else{
        mainPlan=walletPlanProgressHtml(w,mm);
      }

      const goal=currentIsNow?walletGoalHtml(w,balance):"";
      return `<article class="wallet-card${w.systemRole?" insurance":""}${w.type==="savings"?" savings":""}" data-wallet-id="${escapeHtml(w.id)}">
        <div class="wallet-card-top"><h3>${escapeHtml(w.name)}</h3>${w.protected?'<span class="wallet-protected" title="Защищённый кошелёк: перед расходом потребуется подтверждение" aria-label="Защищённый кошелёк">🔒</span>':""}</div>
        <div class="wallet-card-balance">${formatMoney(balance)}</div>
        ${mainPlan}${goal}
        <div class="wallet-card-actions">
          <button class="secondary wallet-expense-btn" data-wallet-action="expense" data-wallet-id="${escapeHtml(w.id)}"${actionsDisabled}>− Расход</button>
          <div class="wallet-overflow-wrap">
            <button class="secondary wallet-overflow-toggle" type="button" data-wallet-overflow-toggle aria-label="Действия кошелька" aria-expanded="false"${actionsDisabled}>⋯</button>
            <div class="wallet-overflow-menu hidden" data-wallet-overflow-menu>
              <button type="button" data-wallet-action="topup" data-wallet-id="${escapeHtml(w.id)}"${actionsDisabled}>Пополнить вручную</button>
            </div>
          </div>
        </div>
      </article>`;
    }).join("") || '<div class="wallet-empty">В этой группе кошельков пока нет.</div>';

    populateWalletHistoryFilters();
    if(!$("walletFullHistoryModal").classList.contains("hidden")) renderWalletHistoryList($("walletHistoryList"),0,{filtered:true});
  }
  function closeWalletOverflowMenus(except=null){
    document.querySelectorAll("[data-wallet-overflow-menu]").forEach(menu=>{
      if(menu===except) return;
      menu.classList.add("hidden");
      menu.classList.remove("open-up");
      const toggle=menu.closest(".wallet-overflow-wrap")?.querySelector("[data-wallet-overflow-toggle]");
      if(toggle) toggle.setAttribute("aria-expanded","false");
    });
  }
  function toggleWalletOverflowMenu(toggle){
    const wrap=toggle?.closest(".wallet-overflow-wrap"),menu=wrap?.querySelector("[data-wallet-overflow-menu]");
    if(!menu || toggle.disabled) return;
    const opening=menu.classList.contains("hidden");
    closeWalletOverflowMenus(menu);
    if(!opening){ menu.classList.add("hidden");toggle.setAttribute("aria-expanded","false");return; }
    menu.classList.remove("hidden","open-up");
    toggle.setAttribute("aria-expanded","true");
    requestAnimationFrame(()=>{
      const r=menu.getBoundingClientRect();
      if(r.bottom>window.innerHeight-8) menu.classList.add("open-up");
    });
  }

  function openWalletDistribution(){
    if(!requireWalletCurrentMonth()) return;
    $("walletDistributionAmount").value="";
    $("walletDistributionPreview").innerHTML='<div class="wallet-empty">Введите общую сумму — здесь появится распределение.</div>';
    $("confirmWalletDistribution").disabled=true;
    $("confirmWalletDistribution").textContent="Распределить";
    $("walletDistributionModal").classList.remove("hidden");
    setTimeout(()=>$("walletDistributionAmount").focus(),60);
  }
  function closeWalletDistribution(){ $("walletDistributionModal").classList.add("hidden");$("confirmWalletDistribution").textContent="Распределить"; }

  function updateWalletDistributionPreview(){
    const amount=parseMoneyInput($("walletDistributionAmount").value);
    const root=$("walletDistributionPreview"),btn=$("confirmWalletDistribution");
    if(!amount || amount<=0){ root.innerHTML='<div class="wallet-empty">Введите сумму больше 0.</div>';btn.disabled=true;return; }
    const calc=calculateWalletDistribution(amount,walletCurrentMonthKey());
    const rows=walletActive().filter(w=>(calc.allocations[w.id]||0)>0).map(w=>`<div class="wallet-preview-row"><span>${escapeHtml(w.name)}</span><b>${formatMoney(calc.allocations[w.id]||0)}</b></div>`).join("");
    let note="";
    if(calc.allPlansClosed) note=`<div class="wallet-preview-note ok">Все планы месяца уже закрыты. Вся сумма попадёт в ${escapeHtml(walletInsurance()?.name||"Страховку")}.</div>`;
    else if(calc.shortage && calc.priority) note='<div class="wallet-preview-note warn">Денег меньше незакрытых планов. Сначала будут закрываться самые важные кошельки.</div>';
    else if(calc.shortage) note='<div class="wallet-preview-note warn">Денег меньше незакрытых планов. Все планы получат часть суммы пропорционально.</div>';
    else note='<div class="wallet-preview-note ok">Программа доложит недостающие суммы по планам, свободный остаток уйдёт в Страховку.</div>';
    root.innerHTML=`<div class="wallet-preview">${rows||'<div class="wallet-empty">Нет кошельков для распределения.</div>'}</div><div class="wallet-preview-total"><span>Итого</span><b>${formatMoney(amount)}</b></div>${note}`;
    btn.textContent=`Распределить ${formatMoney(amount)}`;
    btn.disabled=false;
  }
  async function confirmWalletDistribution(){
    if(walletBusy || !requireWalletCurrentMonth()) return;
    const amount=parseMoneyInput($("walletDistributionAmount").value);
    if(!amount || amount<=0){ toast("Введите сумму больше 0"); return; }
    const calc=calculateWalletDistribution(amount,walletCurrentMonthKey());
    const allocated=Object.values(calc.allocations).reduce((sum,n)=>sum+n,0);
    if(allocated!==amount){ console.error("wallet distribution mismatch",{amount,allocated,calc});toast("Не удалось точно распределить сумму");return; }
    walletBusy=true;
    const busy=beginButtonBusy("confirmWalletDistribution","Распределяем…");
    const previous=clone(walletState);
    try{
      const entries=walletActive().map(w=>({walletId:w.id,amountCents:calc.allocations[w.id]||0})).filter(x=>x.amountCents>0);
      createWalletOperation("distribution",entries,`Общая сумма ${formatMoney(amount)}`);
      closeWalletDistribution();renderWallets();
      const synced=await syncWalletsCloud(false,true);
      toast(synced?`${formatMoney(amount)} успешно распределено`:`${formatMoney(amount)} распределено. Облако синхронизируется позже`);
    }catch(e){
      console.error(e);walletState=previous;try{saveWalletState();}catch(_){}toast("Не удалось сохранить распределение");
    }finally{ walletBusy=false;endButtonBusy(busy); }
  }

  function openWalletTransaction(walletId,type){
    if(!requireWalletCurrentMonth()) return;
    const w=walletDef(walletId); if(!w || w.archived) return;
    const expense=type==="expense";
    $("walletTransactionWalletId").value=walletId;
    $("walletTransactionType").value=expense?"expense":"topup";
    $("walletTransactionTitle").textContent=expense?`Расход — ${w.name}`:`Пополнить — ${w.name}`;
    $("walletTransactionSubtitle").textContent=expense?`Доступно: ${formatMoney(walletBalance(walletId))}`:`Текущий баланс: ${formatMoney(walletBalance(walletId))}`;
    $("walletTransactionAmount").value="";$("walletTransactionComment").value="";$("walletTransactionError").textContent="";
    $("confirmWalletTransaction").textContent=expense?"Списать":"Пополнить";
    $("walletTransactionModal").classList.remove("hidden");
    setTimeout(()=>$("walletTransactionAmount").focus(),60);
  }
  function closeWalletTransaction(){ $("walletTransactionModal").classList.add("hidden"); }

  async function confirmWalletTransaction(){
    if(walletBusy || !requireWalletCurrentMonth()) return;
    const walletId=$("walletTransactionWalletId").value,type=$("walletTransactionType").value;
    const amount=parseMoneyInput($("walletTransactionAmount").value),comment=$("walletTransactionComment").value.trim(),err=$("walletTransactionError");
    const w=walletDef(walletId);
    if(!w || w.archived || !["topup","expense"].includes(type)){ err.textContent="Не удалось определить кошелёк";return; }
    if(!amount || amount<=0){ err.textContent="Введите сумму больше 0";return; }
    if(type==="expense" && amount>walletBalance(walletId)){ err.textContent="В кошельке недостаточно денег.";return; }
    if(type==="expense" && w.protected && !confirm(`Вы собираетесь взять ${formatMoney(amount)} из защищённого кошелька «${w.name}». Продолжить?`)) return;

    walletBusy=true;
    const busy=beginButtonBusy("confirmWalletTransaction",type==="expense"?"Списываем…":"Пополняем…");
    const previous=clone(walletState);
    try{
      if(type==="topup"){
        createWalletOperation("topup",[{walletId,amountCents:amount}],comment);
        const synced=await syncWalletsCloud(false,true);
        closeWalletTransaction();renderWallets();toast(synced?`${formatMoney(amount)} добавлено`:`${formatMoney(amount)} добавлено. Облако синхронизируется позже`);
      }else{
        const op=buildWalletOperation("expense",[{walletId,amountCents:-amount}],comment);
        await applyWalletBatchSafely([op]);
        closeWalletTransaction();renderWallets();toast(`${formatMoney(amount)} списано`);
      }
    }catch(e){
      console.error(e);walletState=previous;try{saveWalletState();}catch(_){}err.textContent=e.message||"Не удалось сохранить операцию";
    }finally{ walletBusy=false;endButtonBusy(busy); }
  }

  function walletStrategyHelpText(){
    return walletState.strategy==="priority"
      ? "Сначала деньги получат кошельки с самым высоким приоритетом."
      : "Если денег не хватает, все планы получат часть суммы.";
  }

  function updateWalletStrategyHelp(){
    const help=$("walletStrategyHelp");
    if(help) help.textContent=$("walletDistributionStrategy")?.value==="priority"
      ? "Сначала деньги получат самые важные кошельки."
      : "Если денег не хватает, все планы получат часть суммы.";
    syncWalletEditPriorityVisibility();
  }

  function renderWalletPlanFields(){
    const root=$("walletPlanFields");
    const rows=w=>`<div class="wallet-plan-row"><label for="wallet-plan-${escapeHtml(w.id)}">${escapeHtml(w.name)}</label><input id="wallet-plan-${escapeHtml(w.id)}" data-wallet-plan="${escapeHtml(w.id)}" inputmode="decimal" value="${moneyInputValue(w.monthlyPlanCents||0)}"></div>`;
    const expense=walletActive().filter(w=>!w.systemRole&&w.type!=="savings");
    const savings=walletActive().filter(w=>!w.systemRole&&w.type==="savings");
    root.innerHTML=`${expense.length?`<div class="wallet-plan-group"><div class="wallet-plan-group-title">Расходы</div>${expense.map(rows).join("")}</div>`:""}${savings.length?`<div class="wallet-plan-group"><div class="wallet-plan-group-title">Накопления</div>${savings.map(rows).join("")}</div>`:""}` || '<div class="wallet-empty">Нет кошельков для планирования.</div>';
    $("walletDistributionStrategy").value=walletState.strategy;
    updateWalletStrategyHelp();
    updateWalletPlanTotal();
  }
  function updateWalletPlanTotal(){
    let total=0,valid=true;
    document.querySelectorAll("[data-wallet-plan]").forEach(inp=>{
      const n=parseMoneyInput(inp.value||"0");
      if(n===null){valid=false;inp.setAttribute("aria-invalid","true");}else{inp.removeAttribute("aria-invalid");total+=n;}
    });
    $("walletPlanTotal").textContent=valid?formatMoney(total):"Проверьте суммы";
    $("saveWalletPlan").disabled=!valid;
  }
  function openWalletPlan(){ renderWalletPlanFields();$("walletPlanModal").classList.remove("hidden"); }
  function closeWalletPlan(){ $("walletPlanModal").classList.add("hidden"); }

  function syncWalletEditPriorityVisibility(){
    const grid=$("walletEditTypePriorityGrid"),field=$("walletEditPriorityField");
    if(!grid||!field) return;
    const show=walletState.strategy==="priority" || $("walletDistributionStrategy")?.value==="priority";
    grid.classList.toggle("priority-hidden",!show);
    field.classList.toggle("hidden",!show);
  }
  async function persistWalletConfig({toastText="Настройки кошельков сохранены",showToast=true}={}){
    walletState.configUpdatedAt=new Date().toISOString();
    saveWalletState();
    if(cloudConfigured() && isAdmin()){
      const token=await getAdminToken(),ownerId=currentAdminUserId();
      if(token&&ownerId) await uploadWalletConfig(token,ownerId,walletState);
    }
    if(showToast) toast(toastText);
  }

  async function saveWalletPlan(){
    if(walletBusy) return;
    const next={};
    for(const inp of document.querySelectorAll("[data-wallet-plan]")){
      const n=parseMoneyInput(inp.value||"0");
      if(n===null || n<0){ toast("Проверьте суммы плана");return; }
      next[inp.dataset.walletPlan]=n;
    }
    walletBusy=true;const busy=beginButtonBusy("saveWalletPlan","Сохраняем…");const previous=clone(walletState);
    try{
      Object.entries(next).forEach(([id,n])=>{ const w=walletDef(id);if(w&&!w.systemRole)w.monthlyPlanCents=n; });
      walletState.strategy=$("walletDistributionStrategy").value==="priority"?"priority":"proportional";
      await persistWalletConfig({showToast:false});closeWalletPlan();renderWallets();toast("Месячные планы сохранены");
    }catch(e){ console.error(e);walletState=previous;try{saveWalletState();}catch(_){}toast("Не удалось сохранить план"); }
    finally{ walletBusy=false;endButtonBusy(busy); }
  }

  function populateWalletTransferSelects(sourceId="",destinationId=""){
    const active=walletActive();
    const options=active.map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join("");
    $("walletTransferFrom").innerHTML='<option value="">Откуда</option>'+options;
    $("walletTransferTo").innerHTML='<option value="">Куда</option>'+options;
    if(sourceId) $("walletTransferFrom").value=sourceId;
    if(destinationId) $("walletTransferTo").value=destinationId;
  }

  function openWalletTransfer(sourceId="",amountCents=0,{archiveAfter=""}={}){
    if(!requireWalletCurrentMonth()) return;
    pendingArchiveWalletId=archiveAfter||"";
    populateWalletTransferSelects(sourceId,"");
    $("walletTransferAmount").value=amountCents?moneyInputValue(amountCents):"";
    $("walletTransferComment").value=archiveAfter?"Перевод остатка перед архивированием":"";
    $("walletTransferError").textContent="";
    $("walletTransferTitle").textContent=archiveAfter?"Перевести остаток и архивировать":"Перевести между кошельками";
    $("walletTransferModal").classList.remove("hidden");
  }
  function closeWalletTransfer(){ pendingArchiveWalletId="";$("walletTransferModal").classList.add("hidden"); }

  async function confirmWalletTransfer(){
    if(walletBusy || !requireWalletCurrentMonth()) return;
    const from=$("walletTransferFrom").value,to=$("walletTransferTo").value,amount=parseMoneyInput($("walletTransferAmount").value),comment=$("walletTransferComment").value.trim(),err=$("walletTransferError");
    const fw=walletDef(from),tw=walletDef(to);
    if(!fw||!tw||fw.archived||tw.archived){err.textContent="Выберите два активных кошелька";return;}
    if(from===to){err.textContent="Выберите разные кошельки";return;}
    if(!amount||amount<=0){err.textContent="Введите сумму больше 0";return;}
    if(amount>walletBalance(from)){err.textContent="В исходном кошельке недостаточно денег";return;}
    if(fw.protected && !confirm(`Вы переводите ${formatMoney(amount)} из защищённого кошелька «${fw.name}». Продолжить?`)) return;

    walletBusy=true;const busy=beginButtonBusy("confirmWalletTransfer","Переводим…");const previous=clone(walletState);const archiveId=pendingArchiveWalletId;
    try{
      const op=buildWalletOperation("transfer",[{walletId:from,amountCents:-amount},{walletId:to,amountCents:amount}],comment);
      await applyWalletBatchSafely([op]);

      if(archiveId && archiveId===from){
        const w=walletDef(archiveId);
        if(w && walletBalance(archiveId)===0){
          const afterTransfer=clone(walletState);
          w.archived=true;
          try{
            await persistWalletConfig({showToast:false});
          }catch(archiveError){
            console.error("wallet archive after transfer",archiveError);
            walletState=afterTransfer;try{saveWalletState();}catch(_){}
            closeWalletTransfer();renderWallets();renderWalletManagement();
            toast("Остаток переведён, но кошелёк не удалось архивировать");
            return;
          }
        }
      }

      closeWalletTransfer();renderWallets();renderWalletManagement();toast(archiveId?"Остаток переведён, кошелёк архивирован":"Перевод выполнен");
    }catch(e){
      console.error(e);walletState=previous;try{saveWalletState();}catch(_){}err.textContent=e.message||"Не удалось выполнить перевод";
    }finally{walletBusy=false;endButtonBusy(busy);}
  }

  function walletHasHistory(id){ return walletState.transactions.some(t=>t.walletId===id); }

  function renderWalletManagement(){
    const root=$("walletManageList"); if(!root) return;
    const active=walletDefinitions({includeArchived:false}),archived=walletDefinitions().filter(w=>w.archived);
    const row=w=>{
      const menu=[];
      if(w.archived){
        menu.push(`<button type="button" data-wallet-restore="${escapeHtml(w.id)}">Восстановить</button>`);
      }else if(!w.systemRole){
        menu.push(`<button type="button" data-wallet-move="up" data-wallet-id="${escapeHtml(w.id)}">Выше</button>`);
        menu.push(`<button type="button" data-wallet-move="down" data-wallet-id="${escapeHtml(w.id)}">Ниже</button>`);
        menu.push(`<button type="button" data-wallet-archive="${escapeHtml(w.id)}">Архивировать</button>`);
      }
      if(!w.systemRole&&!walletHasHistory(w.id)&&walletBalance(w.id)===0) menu.push(`<button type="button" class="danger-text" data-wallet-delete="${escapeHtml(w.id)}">Удалить</button>`);
      const subtitle=w.systemRole?"Системный кошелёк":`${w.type==="savings"?"Накопительный":"Расходный"}${walletState.strategy==="priority"?` · приоритет ${w.priority}`:""}`;
      return `<div class="wallet-manage-row ${w.archived?"archived":""}"><div class="wallet-manage-main"><b>${escapeHtml(w.name)}</b><span>${subtitle}</span></div><div class="wallet-manage-actions"><button class="secondary" data-wallet-edit="${escapeHtml(w.id)}">Изменить</button>${menu.length?`<div class="wallet-overflow-wrap"><button class="secondary wallet-overflow-toggle" type="button" data-wallet-overflow-toggle aria-label="Действия кошелька" aria-expanded="false">⋯</button><div class="wallet-overflow-menu hidden" data-wallet-overflow-menu>${menu.join("")}</div></div>`:""}</div></div>`;
    };
    root.innerHTML=`<div class="wallet-manage-section"><h3>Активные кошельки</h3>${active.map(row).join("")||'<div class="wallet-empty">Нет активных кошельков.</div>'}</div><details class="wallet-manage-archive" ${archived.length?"":""}><summary>Архив (${archived.length})</summary><div class="wallet-manage-section">${archived.map(row).join("")||'<div class="wallet-empty">Архив пуст.</div>'}</div></details>`;
    const clearBtn=$("clearWalletHistoryBtn"),clearState=$("walletClearHistoryState");
    const operationCount=walletOperationGroups().length;
    if(clearBtn) clearBtn.disabled=operationCount===0 || walletBusy;
    if(clearState) clearState.textContent=operationCount
      ? `Будет удалено операций: ${operationCount}. Балансы станут 0 ₽. Кошельки, планы, цели, приоритеты и настройки останутся.`
      : "История уже пустая. Кошельки, планы, цели, приоритеты и настройки сохранены.";
  }
  function openWalletManagement(){ renderWalletManagement();$("walletManageModal").classList.remove("hidden"); }
  function closeWalletManagement(){ $("walletManageModal").classList.add("hidden"); }

  async function clearWalletCloudHistory(token,ownerId){
    // Сервер удаляет историю и в той же транзакции ставит history_cleared_at.
    // Это не даёт другому старому устройству воскресить удалённые операции.
    const res=await authFetch("/rest/v1/rpc/ma_wallet_clear_history",{
      method:"POST",
      headers:{Authorization:"Bearer "+token,Prefer:"return=representation"},
      body:JSON.stringify({})
    });
    if(!res.ok){
      const err=await httpErrorFromResponse(res,"Не удалось удалить историю из Supabase");
      const low=String(err.message||"").toLowerCase();
      if(low.includes("ma_wallet_clear_history") || low.includes("pgrst202") || low.includes("could not find the function") || low.includes("history_cleared_at")){
        throw new Error("В Supabase не установлено обновление очистки. Выполните файл supabase_fix.sql");
      }
      throw err;
    }

    const result=await res.json().catch(()=>null);
    let clearedAt="";
    const raw=Array.isArray(result)?result[0]:result;
    if(typeof raw==="string" && !Number.isNaN(Date.parse(raw))) clearedAt=raw;
    else if(raw?.cleared_at && !Number.isNaN(Date.parse(String(raw.cleared_at)))) clearedAt=String(raw.cleared_at);

    const verify=await authFetch(`/rest/v1/${WALLET_TX_TABLE}?select=id&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`,{
      method:"GET",headers:{Authorization:"Bearer "+token}
    });
    if(!verify.ok) throw await httpErrorFromResponse(verify,"Не удалось проверить очистку Supabase");
    const remaining=await verify.json().catch(()=>[]);
    if(Array.isArray(remaining) && remaining.length){
      throw new Error("Supabase не удалил историю. Проверьте SQL-функцию и права доступа.");
    }

    const configRows=await fetchWalletCloudConfig(token);
    const serverStamp=String(configRows?.[0]?.history_cleared_at||"");
    if(!serverStamp || Number.isNaN(Date.parse(serverStamp))){
      throw new Error("Supabase удалил операции, но не сохранил отметку очистки. Выполните supabase_fix.sql");
    }
    return serverStamp || clearedAt;
  }

  async function clearWalletHistoryAndBalances(){
    if(walletBusy) return;
    const operationCount=walletOperationGroups().length;
    if(!operationCount){toast("История уже пустая");renderWalletManagement();return;}

    if(cloudConfigured()){
      if(!isAdmin()){toast("Для очистки облачной истории войдите как администратор");return;}
      if(navigator.onLine===false){toast("Для безопасной очистки истории нужен интернет");return;}
    }

    const typed=prompt(`Будут безвозвратно удалены все финансовые операции (${operationCount}).\n\nВсе балансы кошельков станут 0 ₽. Сами кошельки, месячные планы, цели, приоритеты и настройки останутся.\n\nДля подтверждения введите УДАЛИТЬ`);
    if(typed===null) return;
    if(String(typed).trim().toUpperCase()!=="УДАЛИТЬ"){toast("Очистка отменена: слово введено неверно");return;}

    createDataBackup("Перед очисткой истории кошельков",true,false);
    downloadFullBackup("MA_Grafik_before_wallet_clear");
    const previous=clone(walletState);
    walletBusy=true;
    const busy=beginButtonBusy("clearWalletHistoryBtn","Удаляем…");
    let cloudDeletedConfirmed=false;
    try{
      // Если подключено облако, сначала удаляем и проверяем данные именно там.
      // Локальная история очищается только после подтверждённого серверного удаления.
      if(cloudConfigured()){
        const token=await getAdminToken(),ownerId=currentAdminUserId();
        if(!token||!ownerId) throw new Error("Сессия администратора закончилась");
        walletState.historyClearedAt=await clearWalletCloudHistory(token,ownerId);
        cloudDeletedConfirmed=true;
        lastWalletCloudFetchAt=0;
      }

      walletState.transactions=[];
      if(!walletState.historyClearedAt) walletState.historyClearedAt=new Date().toISOString();
      saveWalletState();
      walletViewMonthKey=walletCurrentMonthKey();
      closeWalletManagement();
      renderWallets();
      toast(cloudConfigured()?"История удалена из устройства и Supabase. Балансы: 0 ₽":"История удалена. Балансы: 0 ₽");
    }catch(e){
      console.error("wallet history clear",e);
      if(cloudDeletedConfirmed){
        // Серверное удаление уже подтверждено. Старую локальную историю возвращать нельзя,
        // иначе она снова загрузится в Supabase как «недостающая в облаке».
        walletState.transactions=[];
        try{saveWalletState();}catch(_){}
      }else{
        walletState=previous;
        try{saveWalletState();}catch(_){}
      }
      renderWallets();
      renderWalletManagement();
      toast(e?.message||"Не удалось очистить историю");
    }finally{
      walletBusy=false;
      endButtonBusy(busy);
      if(!$("walletManageModal").classList.contains("hidden")) renderWalletManagement();
    }
  }

  function syncWalletEditGoalVisibility(){
    const field=$("walletEditGoalField");
    if(!field) return;
    field.classList.toggle("hidden",$("walletEditType")?.value!=="savings");
  }
  function fillWalletEditForm(w=null){
    walletEditingId=w?.id||"";
    $("walletEditTitle").textContent=w?`Изменить — ${w.name}`:"Добавить кошелёк";
    $("walletEditName").value=w?.name||"";
    $("walletEditType").value=w?.type||"expense";
    $("walletEditGoal").value=moneyInputValue(w?.goalCents||0);
    $("walletEditPriority").value=String(w?.priority||walletActive().length+1);
    $("walletEditRollover").value=w?.rollover||"carry";
    $("walletEditProtected").checked=!!w?.protected;
    if($("walletEditAdvanced")) $("walletEditAdvanced").open=false;
    const system=!!w?.systemRole;
    $("walletEditType").disabled=system;$("walletEditRollover").disabled=system;
    $("walletEditSystemNote").classList.toggle("hidden",!system);
    $("walletEditError").textContent="";
    syncWalletEditPriorityVisibility();
    syncWalletEditGoalVisibility();
  }
  function openWalletEdit(id=""){ const w=id?walletDef(id):null;fillWalletEditForm(w);$("walletEditModal").classList.remove("hidden");setTimeout(()=>$("walletEditName").focus(),60); }
  function closeWalletEdit(){ walletEditingId="";$("walletEditModal").classList.add("hidden"); }

  async function saveWalletEdit(){
    if(walletBusy) return;
    const name=$("walletEditName").value.trim(),selectedType=$("walletEditType").value==="savings"?"savings":"expense",goal=parseMoneyInput($("walletEditGoal").value||"0"),priority=Math.max(1,Math.trunc(Number($("walletEditPriority").value)||1)),error=$("walletEditError");
    if(!name){error.textContent="Введите название";return;}
    if(selectedType==="savings"&&goal===null){error.textContent="Проверьте сумму цели";return;}
    const previous=clone(walletState);walletBusy=true;const busy=beginButtonBusy("saveWalletEdit","Сохраняем…");
    try{
      if(walletEditingId){
        const w=walletDef(walletEditingId);if(!w) throw new Error("Кошелёк не найден");
        w.name=name.slice(0,60);w.priority=priority;w.protected=$("walletEditProtected").checked||!!w.systemRole;
        if(w.type==="savings" || (!w.systemRole&&selectedType==="savings")) w.goalCents=Math.max(0,goal||0);
        if(!w.systemRole){
          w.type=selectedType;
          w.rollover=$("walletEditRollover").value==="insurance"?"insurance":"carry";
          // monthlyPlanCents намеренно не меняется здесь: план редактируется только в «Месячных планах».
        }
      }else{
        const maxOrder=Math.max(0,...walletState.wallets.map(w=>w.order||0));
        walletState.wallets.push(normalizeWalletDefinition({id:walletNewId(),name,type:selectedType,monthlyPlanCents:0,goalCents:selectedType==="savings"?Math.max(0,goal||0):0,protected:$("walletEditProtected").checked,archived:false,order:maxOrder+1,priority,rollover:$("walletEditRollover").value},maxOrder));
      }
      await persistWalletConfig({showToast:false});closeWalletEdit();renderWalletManagement();renderWallets();toast("Кошелёк сохранён");
    }catch(e){console.error(e);walletState=previous;try{saveWalletState();}catch(_){}error.textContent=e.message||"Не удалось сохранить";}
    finally{walletBusy=false;endButtonBusy(busy);}
  }

  async function moveWalletOrder(id,direction){
    if(walletBusy) return;
    const list=walletDefinitions({includeArchived:false});
    const idx=list.findIndex(w=>w.id===id);if(idx<0)return;
    const target=direction==="up"?idx-1:idx+1;if(target<0||target>=list.length)return;
    const previous=clone(walletState);
    walletBusy=true;
    const a=list[idx],b=list[target],tmp=a.order;a.order=b.order;b.order=tmp;
    try{
      await persistWalletConfig({showToast:false});renderWalletManagement();renderWallets();
    }catch(e){
      console.error(e);walletState=previous;try{saveWalletState();}catch(_){}renderWalletManagement();renderWallets();toast("Не удалось изменить порядок");
    }finally{walletBusy=false;}
  }

  async function archiveWallet(id){
    if(walletBusy) return;
    const w=walletDef(id);if(!w||w.systemRole)return;
    const balance=walletBalance(id);
    if(balance>0){
      if(!confirm(`В кошельке «${w.name}» есть ${formatMoney(balance)}. Сначала переведём остаток в другой кошелёк.`)) return;
      openWalletTransfer(id,balance,{archiveAfter:id});return;
    }
    if(walletHasHistory(id) && !confirm(`Архивировать «${w.name}»? История и баланс сохранятся.`)) return;
    const previous=clone(walletState);
    walletBusy=true;w.archived=true;
    try{
      await persistWalletConfig({showToast:false});renderWalletManagement();renderWallets();toast("Кошелёк перемещён в архив");
    }catch(e){
      console.error(e);walletState=previous;try{saveWalletState();}catch(_){}renderWalletManagement();renderWallets();toast("Не удалось архивировать");
    }finally{walletBusy=false;}
  }

  async function restoreWallet(id){
    if(walletBusy) return;
    const w=walletDef(id);if(!w)return;
    const previous=clone(walletState);
    walletBusy=true;w.archived=false;
    try{
      await persistWalletConfig({showToast:false});renderWalletManagement();renderWallets();toast("Кошелёк восстановлен");
    }catch(e){
      console.error(e);walletState=previous;try{saveWalletState();}catch(_){}renderWalletManagement();renderWallets();toast("Не удалось восстановить");
    }finally{walletBusy=false;}
  }

  async function deleteWallet(id){
    if(walletBusy) return;
    const w=walletDef(id);if(!w||w.systemRole)return;
    if(walletHasHistory(id)||walletBalance(id)!==0){toast("Кошелёк с историей нельзя удалить — используйте архив");return;}
    if(!confirm(`Удалить пустой кошелёк «${w.name}»?`)) return;
    const previous=clone(walletState);
    walletBusy=true;walletState.wallets=walletState.wallets.filter(x=>x.id!==id);
    try{
      await persistWalletConfig({showToast:false});renderWalletManagement();renderWallets();toast("Кошелёк удалён");
    }catch(e){
      console.error(e);walletState=previous;try{saveWalletState();}catch(_){}renderWalletManagement();renderWallets();toast("Не удалось удалить");
    }finally{walletBusy=false;}
  }

  function buildReversalOperation(group,label=""){
    return buildWalletOperation("reversal",group.items.map(t=>({walletId:t.walletId,amountCents:-t.amountCents,reversalOfTransactionId:t.id})),label||`Отмена: ${walletOperationTitle(group)}`,{
      reversesOperationId:group.operationId,sourceType:group.type,effectiveAt:group.effectiveAt||group.items[0]?.effectiveAt||group.createdAt
    });
  }

  async function undoWalletOperation(operationId){
    if(walletBusy) return;
    const group=walletOperationGroups().find(g=>g.operationId===operationId);
    if(!group){toast("Операция не найдена");return;}
    if(group.type==="reversal" || walletReversedOperationIds().has(group.operationId)){toast("Эта операция уже отменена или исправлена");return;}
    if(walletMonthKeyFromIso(group.effectiveAt||group.createdAt)!==walletCurrentMonthKey()){
      toast("Старую операцию лучше исправить через «Исправить»");return;
    }
    const label=walletOperationTitle(group);
    if(!confirm(`Отменить операцию «${label}»?

Исходная запись останется в истории, программа создаст обратную операцию.`)) return;
    walletBusy=true;const previous=clone(walletState);
    try{
      await applyWalletBatchSafely([buildReversalOperation(group)]);renderWallets();toast("Операция отменена");
    }catch(e){console.error(e);walletState=previous;try{saveWalletState();}catch(_){}toast(e.message||"Не удалось отменить операцию");}
    finally{walletBusy=false;}
  }

  function openWalletFullHistory(){
    populateWalletHistoryFilters();
    $("walletFullHistoryModal").classList.remove("hidden");
    renderWalletHistoryList($("walletHistoryList"),0,{filtered:true});
  }
  function closeWalletFullHistory(){ $("walletFullHistoryModal").classList.add("hidden"); }

  function openWalletCorrection(operationId){
    const group=walletOperationGroups().find(g=>g.operationId===operationId);if(!group)return;
    if(walletReversedOperationIds().has(group.operationId)){toast("Эта операция уже отменена или исправлена");return;}
    walletCorrectionOperationId=operationId;
    $("walletCorrectionTitle").textContent=`Исправить — ${walletOperationTitle(group)}`;
    $("walletCorrectionNote").textContent=`Исходная операция останется в истории. Изменения будут отнесены к ${walletMonthLabel(walletMonthKeyFromIso(group.effectiveAt||group.createdAt))}.`;
    const root=$("walletCorrectionFields");
    if(group.type==="transfer"){
      const from=group.items.find(t=>t.amountCents<0),to=group.items.find(t=>t.amountCents>0);
      const opts=walletActive().map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join("");
      root.innerHTML=`<div class="field"><label>Откуда</label><select id="walletCorrectionFrom">${opts}</select></div><div class="field"><label>Куда</label><select id="walletCorrectionTo">${opts}</select></div><div class="field"><label>Сумма</label><input id="walletCorrectionAmount" inputmode="decimal" value="${moneyInputValue(Math.abs(from?.amountCents||0))}"></div><div class="field"><label>Комментарий</label><input id="walletCorrectionComment" maxlength="120" value="${escapeHtml(group.items[0]?.comment||"")}"></div>`;
      $("walletCorrectionFrom").value=from?.walletId||"";$("walletCorrectionTo").value=to?.walletId||"";
    }else if(group.type==="distribution"){
      root.innerHTML='<div class="wallet-plan-list">'+group.items.map((t,i)=>`<div class="wallet-plan-row"><label>${escapeHtml(walletDef(t.walletId)?.name||t.walletId)}</label><input data-wallet-correction-entry="${escapeHtml(t.walletId)}" inputmode="decimal" value="${moneyInputValue(Math.abs(t.amountCents))}"></div>`).join("")+'</div><div class="field"><label>Комментарий</label><input id="walletCorrectionComment" maxlength="120" value="'+escapeHtml(group.items[0]?.comment||"")+'"></div>';
    }else{
      const t=group.items[0];
      root.innerHTML=`<div class="field"><label>Сумма</label><input id="walletCorrectionAmount" inputmode="decimal" value="${moneyInputValue(Math.abs(t?.amountCents||0))}"></div><div class="field"><label>Комментарий</label><input id="walletCorrectionComment" maxlength="120" value="${escapeHtml(t?.comment||"")}"></div>`;
    }
    $("walletCorrectionError").textContent="";$("walletCorrectionModal").classList.remove("hidden");
  }
  function closeWalletCorrection(){walletCorrectionOperationId="";$("walletCorrectionModal").classList.add("hidden");}

  async function saveWalletCorrection(){
    if(walletBusy)return;
    const group=walletOperationGroups().find(g=>g.operationId===walletCorrectionOperationId),err=$("walletCorrectionError");if(!group){err.textContent="Операция не найдена";return;}
    let entries=[],comment=$("walletCorrectionComment")?.value.trim()||"";
    if(group.type==="transfer"){
      const from=$("walletCorrectionFrom").value,to=$("walletCorrectionTo").value,amount=parseMoneyInput($("walletCorrectionAmount").value);
      if(!from||!to||from===to){err.textContent="Выберите разные кошельки";return;}if(!amount||amount<=0){err.textContent="Введите сумму больше 0";return;}
      entries=[{walletId:from,amountCents:-amount},{walletId:to,amountCents:amount}];
    }else if(group.type==="distribution"){
      for(const inp of document.querySelectorAll("[data-wallet-correction-entry]")){
        const amount=parseMoneyInput(inp.value||"0");if(amount===null){err.textContent="Проверьте суммы";return;}if(amount>0)entries.push({walletId:inp.dataset.walletCorrectionEntry,amountCents:amount});
      }
      if(!entries.length){err.textContent="Оставьте хотя бы одну сумму больше 0";return;}
    }else{
      const amount=parseMoneyInput($("walletCorrectionAmount").value);if(!amount||amount<=0){err.textContent="Введите сумму больше 0";return;}
      entries=[{walletId:group.items[0].walletId,amountCents:group.type==="expense"?-amount:amount}];
    }
    if(!confirm("Исправить операцию? Старая запись останется в истории, будет создана отмена и новая правильная запись."))return;
    walletBusy=true;const busy=beginButtonBusy("saveWalletCorrection","Исправляем…");const previous=clone(walletState);
    try{
      const reversal=buildReversalOperation(group,`Исправление: отмена ${walletOperationTitle(group)}`);
      const corrected=buildWalletOperation(group.type,entries,comment,{effectiveAt:group.effectiveAt||group.createdAt,sourceType:"correction"});
      await applyWalletBatchSafely([reversal,corrected]);closeWalletCorrection();renderWallets();toast("Операция исправлена");
    }catch(e){console.error(e);walletState=previous;try{saveWalletState();}catch(_){}err.textContent=e.message||"Не удалось исправить операцию";}
    finally{walletBusy=false;endButtonBusy(busy);}
  }

  function walletHasCurrentMonthActivity(id,monthKey){
    return walletState.transactions.some(t=>t.walletId===id && walletTransactionMonth(t)===monthKey);
  }

  async function maybeApplyWalletMonthRollover(token=null,ownerId=null){
    const current=walletCurrentMonthKey();
    if(walletState.lastRolloverMonth===current) return;
    const previousMonth=walletShiftMonth(current,-1),insurance=walletInsurance();
    if(!insurance){walletState.lastRolloverMonth=current;saveWalletState();return;}
    const ops=[];let skipped=false;
    walletActive().forEach(w=>{
      if(w.systemRole || w.rollover!=="insurance") return;
      const prevBalance=walletBalanceAtMonth(w.id,previousMonth);
      if(prevBalance<=0) return;
      // Позднее автоматическое списание не делаем, если в новом месяце уже были операции по этому кошельку.
      if(walletHasCurrentMonthActivity(w.id,current)){skipped=true;return;}
      ops.push(buildWalletOperation("auto_carryover",[{walletId:w.id,amountCents:-prevBalance},{walletId:insurance.id,amountCents:prevBalance}],`Остаток за ${walletMonthLabel(previousMonth)} → ${insurance.name}`,{effectiveAt:walletStartOfMonthIso(current)}));
    });
    try{
      if(ops.length) await applyWalletBatchSafely(ops,{skipSync:true});
      walletState.lastRolloverMonth=current;
      walletState.configUpdatedAt=new Date().toISOString();
      saveWalletState();
      if(cloudConfigured()&&isAdmin()){
        token=token||await getAdminToken();ownerId=ownerId||currentAdminUserId();if(token&&ownerId)await uploadWalletConfig(token,ownerId,walletState);
      }
      if(skipped) toast("Правило остатка не применено к части кошельков: в новом месяце уже были операции");
    }catch(e){console.error("wallet rollover",e);}
  }


  function isMobileAdminNav(){
    return window.matchMedia("(max-width:899px)").matches && !isEmployeePhoneMode() && !isServiceDeviceMode();
  }

  function openMobileMoreMenu(){
    if(!isMobileAdminNav()) return;
    const modal=$("mobileMoreModal");
    if(modal) modal.classList.remove("hidden");
  }

  function closeMobileMoreMenu(){
    const modal=$("mobileMoreModal");
    if(modal) modal.classList.add("hidden");
  }

  function openMobileMoreTab(tab){
    closeMobileMoreMenu();
    switchTab(tab);
  }

  function applyUserMode(){
    const employeeMode=isEmployeePhoneMode();
    const serviceMode=isServiceDeviceMode();

    document.body.classList.toggle("employee-phone-mode",employeeMode);
    document.body.classList.toggle("service-device-mode",serviceMode);

    const inner=$("bottomInner");
    const t1=$("bottomTab1"),t2=$("bottomTab2"),t3=$("bottomTab3"),t4=$("bottomTab4"),t5=$("bottomTab5"),t6=$("bottomTab6"),tMore=$("bottomTabMore");
    const brand=document.querySelector(".brand");

    if(employeeMode){
      updateDesktopNavBrand("employee");
      if(brand) brand.textContent="MA График";
      inner.classList.remove("admin-four","admin-five","admin-six");
      inner.classList.add("employee-three");

      t1.textContent="Сегодня"; t1.dataset.tab="employeeToday"; t1.classList.remove("hidden");
      t2.textContent="Мой график"; t2.dataset.tab="employeeMy"; t2.classList.remove("hidden");
      t3.textContent="Календарь"; t3.dataset.tab="employeeCalendar"; t3.classList.remove("hidden");
      t4.classList.add("hidden");
      t5.classList.add("hidden");
      t6.classList.add("hidden");
      if(tMore) tMore.classList.add("hidden");

      $("adminBtn").textContent="Админ";
      ensureEmployeeSelected();
      renderEmployeePages();

      const visible =
        !$("employeeTodayPage").classList.contains("hidden") ||
        !$("employeeMyPage").classList.contains("hidden") ||
        !$("employeeCalendarPage").classList.contains("hidden");

      if(!visible ||
         !$("adminTodayPage").classList.contains("hidden") ||
         !$("schedulePage").classList.contains("hidden") ||
         !$("desktopCalendarPage").classList.contains("hidden") ||
         !$("historyPage").classList.contains("hidden") ||
         !$("kpiPage").classList.contains("hidden") ||
         !$("settingsPage").classList.contains("hidden") ||
         !$("walletsPage").classList.contains("hidden")){
        switchTab(employeeMobileView || "employeeToday");
      }
      return;
    }

    if(serviceMode){
      const service=serviceDeviceName();
      updateDesktopNavBrand("service",service);
      if(brand) brand.textContent=`${service} · Смена`;
      inner.classList.remove("admin-four","admin-five","admin-six");
      inner.classList.add("employee-three");

      t1.textContent="Сегодня"; t1.dataset.tab="adminToday"; t1.classList.remove("hidden");
      t2.textContent="График"; t2.dataset.tab="schedule"; t2.classList.remove("hidden");
      t3.textContent="Календарь"; t3.dataset.tab="desktopCalendar"; t3.classList.remove("hidden");
      t4.classList.add("hidden");
      t5.classList.add("hidden");
      t6.classList.add("hidden");
      if(tMore) tMore.classList.add("hidden");

      $("adminBtn").textContent="Админ";
      if($("attentionTitle")) $("attentionTitle").textContent="Контроль смены";
      $("employeePickerModal").classList.add("hidden");

      if(!$("historyPage").classList.contains("hidden") ||
         !$("kpiPage").classList.contains("hidden") ||
         !$("settingsPage").classList.contains("hidden") ||
         !$("walletsPage").classList.contains("hidden") ||
         !$("employeeTodayPage").classList.contains("hidden") ||
         !$("employeeMyPage").classList.contains("hidden") ||
         !$("employeeCalendarPage").classList.contains("hidden")){
        switchTab("adminToday");
      }

      renderTodayShifts();
      return;
    }

    updateDesktopNavBrand("admin");
    if(brand) brand.textContent="MA График";
    if($("attentionTitle")) $("attentionTitle").textContent="Требует внимания";
    const mobileAdmin=isMobileAdminNav();
    inner.classList.remove("employee-three","admin-four","admin-five","admin-six");
    inner.classList.add(mobileAdmin?"admin-five":"admin-six");

    t1.textContent="Сегодня"; t1.dataset.tab="adminToday"; t1.classList.remove("hidden");
    t2.textContent="График"; t2.dataset.tab="schedule"; t2.classList.remove("hidden");
    t3.textContent="Календарь"; t3.dataset.tab="desktopCalendar"; t3.classList.remove("hidden");
    t6.textContent="Кошельки"; t6.dataset.tab="wallets"; t6.classList.remove("hidden");

    if(mobileAdmin){
      // На телефоне набор задаёт сам JS: ровно 5 пунктов. CSS остаётся только страховкой.
      t4.classList.add("hidden");
      t5.classList.add("hidden");
      if(tMore){ tMore.textContent="Ещё"; tMore.dataset.tab="more"; tMore.classList.remove("hidden"); }
    }else{
      t4.textContent="История"; t4.dataset.tab="history"; t4.classList.remove("hidden");
      t5.textContent="Настройки"; t5.dataset.tab="settings"; t5.classList.remove("hidden");
      if(tMore) tMore.classList.add("hidden");
    }
    if(tMore) tMore.classList.toggle("active",mobileAdmin && (!$("historyPage").classList.contains("hidden") || !$("kpiPage").classList.contains("hidden") ||
         !$("settingsPage").classList.contains("hidden")));

    $("employeePickerModal").classList.add("hidden");

    const anyVisible =
      !$("adminTodayPage").classList.contains("hidden") ||
      !$("schedulePage").classList.contains("hidden") ||
      !$("desktopCalendarPage").classList.contains("hidden") ||
      !$("historyPage").classList.contains("hidden") ||
      !$("kpiPage").classList.contains("hidden") ||
         !$("settingsPage").classList.contains("hidden") ||
      !$("walletsPage").classList.contains("hidden");

    if(!anyVisible){
      switchTab("adminToday");
    }
  }

  function updateAuthUI(){
    const btn=$("adminBtn"); if(!btn) return;
    btn.textContent=isAdmin() ? "Админ ✓" : ((isEmployeePhoneMode() || isServiceDeviceMode()) ? "Админ" : "Администратор");
    if($("quickReplaceBtn")) $("quickReplaceBtn").classList.toggle("hidden",!isAdmin());
    updateCloudSettingsState();
    if(!document.body.classList.contains("app-booting") && $("todayShiftCards")) renderTodayShifts();
    if($("currentDeviceState")) renderDevicePanel();
    applyUserMode();
    if(!$("schedulePage").classList.contains("hidden")) renderMonth();
    if(isAdmin() && cloudConfigured() && !document.body.classList.contains("app-booting")) syncWalletsCloud(false);
  }

  // Supabase REST/auth helpers are provided by supabase.js

  function addDaysToDateString(dateStr,days){
    const [y,m,d]=String(dateStr).split("-").map(Number);
    const dt=new Date(Date.UTC(y,m-1,d));
    dt.setUTCDate(dt.getUTCDate()+Number(days||0));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
  }

  function legacyDaysFromAnchor(s,date){
    const [y,m,d]=String(s.anchorDate||DEFAULTS.anchorDate).split("-").map(Number);
    const a=Date.UTC(y,m-1,d);
    const b=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
    return Math.floor((b-a)/86400000);
  }

  function legacyPairPhase(s,date,role,group){
    const days=legacyDaysFromAnchor(s,date);
    const blockDays=Math.max(1,Number(s.serviceBlockDays)||14);
    const block=Math.floor(days/blockDays);
    const baseOffset=group===1?2:0;
    const positiveModulo=(value,size)=>((value%size)+size)%size;

    if(role==="master"){
      const partnerCycle=positiveModulo(Math.floor(block/2),2);
      const masterFlip=partnerCycle?2:0;
      return positiveModulo(days+baseOffset+masterFlip,4);
    }

    return positiveModulo(days+baseOffset,4);
  }

  async function syncFromCloud(showToast=false){
    if(!cloudConfigured()){
      setCloudStatus("Локально","offline");
      updateCloudSettingsState();
      if(showToast) toast("Supabase ещё не подключён");
      return false;
    }

    if(settingsDirty && !$("settingsPage").classList.contains("hidden")){
      if(showToast) toast("Есть несохранённые изменения");
      return false;
    }

    const nowMs=Date.now();
    if(!showToast && nowMs-lastCloudFetchAt<15000) return true;
    if(cloudSyncPromise) return cloudSyncPromise;

    cloudSyncPromise=(async()=>{
      if(showToast) setCloudStatus("Синхронизация…","syncing");

      try{
        const res=await authFetch(`/rest/v1/${CLOUD_TABLE}?id=eq.${encodeURIComponent(CLOUD_ROW_ID)}&select=settings,updated_at`,{method:"GET"});
        if(!res.ok) throw await httpErrorFromResponse(res,"Не удалось загрузить общий график");
        const rows=await res.json().catch(()=>[]);
        lastCloudFetchAt=Date.now();

        if(rows && rows[0] && rows[0].settings && Object.keys(rows[0].settings).length){
          const remoteSettings=mergeRemoteSettings(rows[0].settings);
          const remoteSignature=stableJson(remoteSettings);
          const localSignature=stableJson(settings);
          const settingsChanged=remoteSignature!==localSignature;

          lastCloudUpdatedAt=rows[0].updated_at || lastCloudUpdatedAt;

          if(settingsChanged){
            const y=window.scrollY;
            createDataBackup("Перед обновлением графика из облака",false,false);
            settings=remoteSettings;
            localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));
            lastSettingsSignature=remoteSignature;
            if(!userSelectedMonth) currentIndex=getCurrentMonthIndex();

            if(!$("settingsPage").classList.contains("hidden")) populateSettings();
            if(!$("schedulePage").classList.contains("hidden")) renderMonth();
            if(isEmployeePhoneMode()) renderEmployeePages();
            if(!$("adminTodayPage").classList.contains("hidden")) renderTodayShifts();

            if(isEmployeePhoneMode() && !selectedEmployee()) openEmployeePicker();
            restoreScrollAfterRender(y);
          }else{
            lastSettingsSignature=remoteSignature;
          }
        }

        setCloudStatus("Онлайн","online");
        updateCloudSettingsState();
        if(showToast) toast("Общий график обновлён");
        return true;
      }catch(e){
        logAppError("schedule cloud sync",e);
        const info=classifySyncError(e);
        if(info.kind==="offline") setCloudStatus("Нет связи","offline");
        else if(info.kind==="temporary") setCloudStatus("Облако временно недоступно","offline");
        else if(info.kind==="forbidden" || info.kind==="auth") setCloudStatus("Ошибка доступа","offline");
        else setCloudStatus("Ошибка облака","offline");
        if(showToast) toast(info.kind==="temporary"?"Временная ошибка облака. Повторим автоматически":"Не удалось загрузить общий график");
        return false;
      }
    })();

    try{
      return await cloudSyncPromise;
    }finally{
      cloudSyncPromise=null;
    }
  }
  async function saveToCloud(newSettings,{force=false}={}){
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
  }

  function moscowParts(date=new Date()){
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:SHIFT_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(date);
    const o={}; parts.forEach(p=>{ if(p.type!=="literal") o[p.type]=p.value; });
    return {date:`${o.year}-${o.month}-${o.day}`,time:`${o.hour}:${o.minute}`,hour:Number(o.hour),minute:Number(o.minute),year:Number(o.year),month:Number(o.month),day:Number(o.day)};
  }

  function formatMoscowDate(iso){
    if(!iso) return "—";
    return new Intl.DateTimeFormat("ru-RU",{timeZone:SHIFT_TIMEZONE,day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(iso));
  }
  function formatMoscowTime(iso){
    if(!iso) return "—";
    return new Intl.DateTimeFormat("ru-RU",{timeZone:SHIFT_TIMEZONE,hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
  }
  function isoAtMoscow(dateStr,timeStr){
    if(!dateStr || !timeStr) return null;
    return new Date(`${dateStr}T${timeStr}:00+03:00`).toISOString();
  }
  function addDaysISO(iso,days){ const d=new Date(iso+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }

  async function shiftFunction(body,{admin=false}={}){
    const headers={"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY};
    if(admin){
      const token=await getAdminToken();
      if(!token) throw new Error("Нужно войти как администратор");
      headers.Authorization="Bearer "+token;
    }
    const res=await fetch(SHIFT_FUNCTION_URL,{method:"POST",headers,body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok || data.ok===false) throw new Error(data.error || data.message || "Ошибка сервера смен");
    return data;
  }

  function fillDeviceServiceSelect(){
    const sel=$("deviceService"); if(!sel) return;
    const prev=sel.value;
    sel.innerHTML=`<option value="${escapeHtml(settings.service1)}">${escapeHtml(settings.service1)}</option><option value="${escapeHtml(settings.service2)}">${escapeHtml(settings.service2)}</option>`;
    if([...sel.options].some(o=>o.value===prev)) sel.value=prev;
  }

  async function refreshDeviceAccess(){
    const token=loadShiftDeviceToken();

    if(!token){
      saveCachedDeviceView(null);
      currentDeviceAccess={allowed:false,device:null,verified:false};
      renderDevicePanel();
      renderTodayShifts();
      applyUserMode();
      if(isStartupShiftMode()) renderStartupShiftWindow();
      return currentDeviceAccess;
    }

    try{
      const keyRecord=await loadDeviceKeyRecord();

      // ВАЖНО: ничего не удаляем автоматически.
      // При запуске Windows Chrome/IndexedDB/интернет могут быть ещё не готовы.
      // Раньше временный сбой мог стереть локальную привязку устройства.
      if(!keyRecord?.privateKey){
        if(deviceSecurity.lastKeyReadFailed()){
          // IndexedDB мог быть временно недоступен сразу после запуска браузера.
          // Сохраняем известный режим точки, но не разрешаем операции до проверки ключа.
          const cached=loadCachedDeviceView();
          currentDeviceAccess=cached || {allowed:false,device:null,verified:false};
        }else{
          // Хранилище прочиталось нормально, но ключа действительно нет.
          saveCachedDeviceView(null);
          currentDeviceAccess={allowed:false,device:null,verified:false};
        }
        renderDevicePanel();
        renderTodayShifts();
        applyUserMode();
        if(isStartupShiftMode()) renderStartupShiftWindow();
        return currentDeviceAccess;
      }

      const deviceProof=await signDeviceProof("status");
      const data=await shiftFunction({
        op:"device-status",
        deviceToken:token,
        deviceProof
      });

      if(data.allowed && data.device){
        currentDeviceAccess={allowed:true,device:data.device,verified:true,cached:false};
        saveCachedDeviceView(data.device);
      }else{
        // Сервер явно не подтвердил устройство — кеш больше не используем.
        saveCachedDeviceView(null);
        currentDeviceAccess={allowed:false,device:null,verified:false};
      }
    }catch(e){
      console.error("device-status",e);
      // При временной ошибке оставляем кешированный режим точки,
      // но открытие/закрытие смены будет недоступно до серверной проверки.
      const cached=loadCachedDeviceView();
      currentDeviceAccess=cached || {allowed:false,device:null,verified:false};
    }

    renderDevicePanel();
    renderTodayShifts();
    applyUserMode();
    if(isStartupShiftMode()) renderStartupShiftWindow();
    return currentDeviceAccess;
  }

  async function loadRegisteredDevices(){
    if(!isAdmin()){
      deviceListCache=[];
      deviceListLoadState="unknown";
      renderDevicePanel();
      return false;
    }
    try{
      const data=await shiftFunction({op:"list-devices"},{admin:true});
      deviceListCache=data.devices||[];
      deviceListLoadState="ok";
      renderDevicePanel();
      return true;
    }catch(e){
      console.error("list-devices",e);
      deviceListLoadState="error";
      renderDevicePanel();
      return false;
    }
  }

  function renderDevicePanel(){
    const state=$("currentDeviceState"), list=$("deviceList"), pairBtn=$("pairDeviceBtn");
    if(!state || !list || !pairBtn) return;
    fillDeviceServiceSelect();

    if(currentDeviceAccess.allowed && currentDeviceAccess.device){
      const d=currentDeviceAccess.device;
      state.className="device-state ok";
      state.innerHTML=currentDeviceAccess.verified===false
        ? `<b>Устройство найдено.</b><br>${escapeHtml(d.service)} · проверяем доступ…`
        : `<b>Это устройство разрешено.</b><br>${escapeHtml(d.service)} · ${escapeHtml(d.label||"Устройство сервиса")}`;
    }else{
      state.className="device-state bad";
      state.innerHTML='<b>Это устройство не зарегистрировано.</b><br>Сотрудник с этого телефона или компьютера не сможет открыть/закрыть смену.';
    }

    pairBtn.disabled=!isAdmin();
    pairBtn.textContent=isAdmin() ? "Разрешить это устройство" : "Только администратор может разрешить устройство";

    if(!isAdmin()){
      list.innerHTML="";
      updateSettingsSystemStatus();
      return;
    }

    const active=deviceListCache.filter(d=>d.active);
    list.innerHTML=active.length ? active.map(d=>`
      <div class="device-item">
        <div><b>${escapeHtml(d.service)}</b> · ${escapeHtml(d.label||"Устройство")}
          <small>${Number(d.key_version||0)>=2 ? "Защищено" : "Старая регистрация"}${d.last_seen_at ? ` · было в сети ${formatMoscowDate(d.last_seen_at)} ${formatMoscowTime(d.last_seen_at)}` : ""}</small>
        </div>
        <button class="device-revoke" data-device-id="${escapeHtml(d.id)}">Отключить</button>
      </div>`).join("") : '<div class="device-state">Активных устройств пока нет.</div>';

    list.querySelectorAll(".device-revoke").forEach(btn=>{
      btn.onclick=()=>revokeRegisteredDevice(btn.dataset.deviceId);
    });

    updateSettingsSystemStatus();
  }

  async function pairCurrentDevice(){
    if(!isAdmin()){ openLoginModal(); return; }

    const service=$("deviceService").value;
    const label=$("deviceLabel").value.trim() || `Устройство ${service}`;

    if(!confirm(`Разрешить это устройство для точки «${service}»?\n\nПредыдущее активное устройство этой точки будет отключено.`)) return;

    const busy=beginButtonBusy("pairDeviceBtn","Регистрируем…");
    if(!busy) return;

    // Старые токен и ключ не трогаем, пока сервер не подтвердит новую регистрацию.
    // Это защищает рабочее устройство от потери привязки при временном сбое сети.
    try{
      const keyRecord=await generateDeviceKeyRecord();

      const data=await shiftFunction({
        op:"pair-device",
        service,
        label,
        publicKeyJwk:keyRecord.publicJwk
      },{admin:true});

      await saveDeviceKeyRecord(keyRecord);
      saveShiftDeviceToken(data.deviceToken);
      currentDeviceAccess={allowed:true,device:data.device,verified:true,cached:false};
      saveCachedDeviceView(data.device);

      await loadRegisteredDevices();
      renderTodayShifts();
      toast(`${service}: устройство защищённо зарегистрировано`);
    }catch(e){
      console.error(e);
      // Важно: старую локальную регистрацию не стираем из-за ошибки новой попытки.
      await refreshDeviceAccess();
      toast(e.message||"Не удалось разрешить устройство");
    }finally{
      endButtonBusy(busy);
    }
  }

  async function revokeRegisteredDevice(id){
    if(!isAdmin() || !id) return;
    const lockKey=`revoke-device:${id}`;
    if(adminMutationLocks.has(lockKey)) return;
    if(!confirm("Отключить это устройство? С него больше нельзя будет открыть или закрыть смену.")) return;
    adminMutationLocks.add(lockKey);
    try{
      await shiftFunction({op:"revoke-device",id},{admin:true});
      if(currentDeviceAccess.device && String(currentDeviceAccess.device.id)===String(id)){
        saveShiftDeviceToken("");
        saveCachedDeviceView(null);
        await clearDeviceKeyRecord();
        currentDeviceAccess={allowed:false,device:null,verified:false};
      }
      await loadRegisteredDevices();
      renderTodayShifts();
      toast("Устройство отключено");
    }catch(e){
      console.error(e);
      toast(e.message||"Не удалось отключить устройство");
    }finally{
      adminMutationLocks.delete(lockKey);
    }
  }

  const {
    expectedForDate,
    shiftMinutes,
    shiftStartForService,
    shiftEndForService,
    isValidShiftPin
  }=window.MAShifts.create({
    getSettings:()=>settings,
    monthIndexForYearMonth,
    getDaySchedule:()=>daySchedule
  });

  const kpiCore=window.MAKpi.create({
    expectedForDate,
    serviceNames:()=>[settings.service1,settings.service2].filter(Boolean),
    getEmployeesForDate:dateStr=>employeesForDate(dateObjectFromKey(dateStr)),
    isNoManagerValue,
    shiftStartForService,
    shiftEndForService,
    shiftMinutes,
    moscowParts,
    escapeHtml
  });

  function isStartupShiftMode(){
    return STARTUP_SHIFT_MODE;
  }

  function russianDateLong(dateStr){
    try{
      return new Intl.DateTimeFormat("ru-RU",{
        timeZone:SHIFT_TIMEZONE,
        weekday:"long",
        day:"numeric",
        month:"long",
        year:"numeric"
      }).format(new Date(dateStr+"T12:00:00+03:00"));
    }catch(e){ return dateStr; }
  }

  function startupManagerOptions(expectedManager){
    const names=(expectedManager && moscowParts().date>=MANAGER_ROSTER_FROM) ? [expectedManager] : activeManagerNames();
    return names.map(n=>`<option value="${escapeHtml(n)}" ${n===expectedManager?"selected":""}>${escapeHtml(n)}</option>`).join("");
  }

  function closeStartupShiftWindow(){
    try{ window.close(); }catch(e){}
    setTimeout(()=>{
      const root=$("startupShiftContent");
      if(root){
        root.innerHTML=`
          <div class="startup-shift-done">
            <div class="big-check">✓</div>
            <b>Готово</b>
            <span>Окно можно закрыть.</span>
          </div>`;
      }
    },250);
  }

  function scheduleStartupDeviceRetry(){
    if(!isStartupShiftMode()) return;
    if(currentDeviceAccess.allowed) return;
    if(!loadShiftDeviceToken()) return;
    if(startupDeviceRetryTimer) return;
    if(startupDeviceRetryCount>=6) return;

    startupDeviceRetryCount++;
    startupDeviceRetryTimer=setTimeout(async()=>{
      startupDeviceRetryTimer=null;
      try{
        await refreshDeviceAccess();
        if(currentDeviceAccess.allowed){
          startupDeviceRetryCount=0;
          await loadTodayShifts(false);
          renderStartupShiftWindow();
          return;
        }
      }catch(e){
        console.error("startup device retry",e);
      }
      scheduleStartupDeviceRetry();
    },3000);
  }

  function renderStartupShiftWindow(){
    if(!isStartupShiftMode()) return;
    const root=$("startupShiftContent");
    if(!root) return;

    if(!cloudConfigured()){
      root.innerHTML=`<div class="startup-shift-status bad">Нет подключения к Supabase. Проверь интернет и настройки сайта.</div>`;
      return;
    }

    if(!currentDeviceAccess.allowed || !currentDeviceAccess.device){
      const hasLocalRegistration=!!loadShiftDeviceToken();
      root.innerHTML=hasLocalRegistration ? `
        <div class="startup-shift-status info">
          Проверяем привязку рабочего компьютера…
        </div>
        <div class="startup-shift-loading" style="padding:10px 0">
          После включения Windows интернет и хранилище Chrome могут загрузиться не сразу. Повторяем проверку автоматически.
        </div>
        <button class="startup-shift-close" id="startupRetryDevice">Проверить сейчас</button>`
      : `
        <div class="startup-shift-status warn">
          В этом профиле Chrome нет регистрации рабочего компьютера.
        </div>
        <div class="startup-shift-loading" style="padding:10px 0">
          Открой обычный MA График в этом же профиле Chrome → Админ → Настройки → Рабочее устройство точки и зарегистрируй компьютер.
        </div>
        <button class="startup-shift-close" id="startupRetryDevice">Проверить ещё раз</button>`;

      const retry=$("startupRetryDevice");
      if(retry) retry.onclick=async()=>{
        root.innerHTML='<div class="startup-shift-loading">Проверяем устройство…</div>';
        await refreshDeviceAccess();
        await loadTodayShifts(false);
        renderStartupShiftWindow();
      };

      if(hasLocalRegistration) scheduleStartupDeviceRetry();
      return;
    }

    startupDeviceRetryCount=0;
    if(startupDeviceRetryTimer){
      clearTimeout(startupDeviceRetryTimer);
      startupDeviceRetryTimer=null;
    }

    const now=moscowParts();
    const service=currentDeviceAccess.device.service;
    const serviceStart=shiftStartForService(service);
    const serviceEnd=shiftEndForService(service);
    const expected=expectedForDate(now.date,service);
    const row=currentShiftRows.find(x=>x.service===service)||null;

    if(expected && isNoManagerValue(expected.manager)){
      root.innerHTML=`
        <div class="startup-shift-date">${escapeHtml(russianDateLong(now.date))}</div>
        <div class="startup-shift-service">${escapeHtml(service)}</div>
        <div class="startup-shift-people">
          <div class="startup-shift-person"><span>Сегодня</span><b>Только мастер</b></div>
          <div class="startup-shift-person"><span>Мастер</span><b>${escapeHtml(expected.master||"—")}</b></div>
          <div class="startup-shift-person"><span>Смена</span><b>${escapeHtml(serviceStart)}–${escapeHtml(serviceEnd)}</b></div>
        </div>
        <div class="startup-shift-status ok">В субботу и воскресенье в ${escapeHtml(settings.service2)} менеджер не требуется. Открывать смену по PIN не нужно.</div>
        <button class="startup-shift-close" id="startupCloseWindow">Закрыть окно</button>`;
      const closeBtn=$("startupCloseWindow");
      if(closeBtn) closeBtn.onclick=closeStartupShiftWindow;
      return;
    }

    const nowM=now.hour*60+now.minute;
    const startM=shiftMinutes(serviceStart);
    const endM=shiftMinutes(serviceEnd);

    let action=null;
    if(!row?.opened_at) action="open";
    else if(!row?.closed_at && nowM>=endM-30) action="close";

    let statusClass="info";
    let statusText="";
    if(!row?.opened_at){
      if(nowM<startM){
        const left=startM-nowM;
        statusClass="info";
        statusText=`До начала смены ${left} мин. Можно открыть смену заранее.`;
      }else if(nowM<startM+10){
        statusClass="warn";
        statusText="Смена начинается сейчас. Не забудь открыть её.";
      }else{
        statusClass="bad";
        statusText=`Смена не открыта. Опоздание: ${nowM-startM} мин.`;
      }
    }else if(!row.closed_at){
      if(nowM>=endM-30){
        statusClass=nowM>endM+15?"bad":"warn";
        statusText=nowM>endM
          ? `Смена ещё не закрыта. После конца смены прошло ${nowM-endM} мин.`
          : `Смена открыта. До конца осталось ${endM-nowM} мин.`;
      }else{
        statusClass="ok";
        statusText=`Смена открыта в ${formatMoscowTime(row.opened_at)}. Всё в порядке.`;
      }
    }else{
      statusClass="ok";
      statusText=`Смена закрыта в ${formatMoscowTime(row.closed_at)}.`;
    }

    const expectedManager=expected?.manager||"";
    const expectedMaster=expected?.master||"—";

    let actionBlock="";
    if(action){
      const verb=action==="open"?"ОТКРЫТЬ СМЕНУ":"ЗАКРЫТЬ СМЕНУ";
      const buttonClass=action==="close"?"startup-shift-mainbtn close-action":"startup-shift-mainbtn";
      actionBlock=`
        <div class="startup-shift-form">
          <div>
            <label>Кто подтверждает</label>
            <select id="startupShiftEmployee">${startupManagerOptions(expectedManager)}</select>
          </div>
          <div>
            <label>PIN менеджера</label>
            <input id="startupShiftPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••">
          </div>
          <button class="${buttonClass}" id="startupShiftConfirm">${verb}</button>
        </div>
        <div class="startup-shift-error" id="startupShiftError"></div>`;
    }else{
      actionBlock=`<button class="startup-shift-close" id="startupCloseWindow">Закрыть окно</button>`;
    }

    root.innerHTML=`
      <div class="startup-shift-date">${escapeHtml(russianDateLong(now.date))}</div>
      <div class="startup-shift-service">${escapeHtml(service)}</div>

      <div class="startup-shift-people">
        <div class="startup-shift-person"><span>Менеджер</span><b>${escapeHtml(expectedManager||"—")}</b></div>
        <div class="startup-shift-person"><span>Мастер</span><b>${escapeHtml(expectedMaster)}</b></div>
        <div class="startup-shift-person"><span>Смена</span><b>${escapeHtml(serviceStart)}–${escapeHtml(serviceEnd)}</b></div>
      </div>

      <div class="startup-shift-status ${statusClass}">${escapeHtml(statusText)}</div>
      ${actionBlock}
      ${action ? '<button class="startup-shift-close" id="startupCloseWindow">Закрыть окно</button>' : ''}
    `;

    const closeBtn=$("startupCloseWindow");
    if(closeBtn) closeBtn.onclick=closeStartupShiftWindow;

    const pin=$("startupShiftPin");
    const confirmBtn=$("startupShiftConfirm");
    if(pin && confirmBtn){
      pin.focus();
      pin.addEventListener("keydown",e=>{ if(e.key==="Enter") confirmStartupShiftAction(action,service,expected); });
      confirmBtn.onclick=()=>confirmStartupShiftAction(action,service,expected);
    }
  }

  async function confirmStartupShiftAction(action,service,expected){
    const employee=$("startupShiftEmployee")?.value||"";
    const pin=$("startupShiftPin")?.value.trim()||"";
    const error=$("startupShiftError");
    const btn=$("startupShiftConfirm");

    if(!isValidShiftPin(pin)){
      if(error) error.textContent="PIN должен быть из 4 цифр";
      return;
    }

    if(expected?.manager && employee!==expected.manager){
      const verb=action==="open"?"открываете":"закрываете";
      const ok=confirm(`По графику сегодня менеджер ${expected.manager}.\n\nВы ${verb} смену как ${employee}. Продолжить?`);
      if(!ok) return;
    }

    if(btn){
      btn.disabled=true;
      btn.textContent="Проверяем…";
    }
    if(error) error.textContent="";

    try{
      if(!canUseShiftService(service)) throw new Error("Этот компьютер не разрешён для этой точки");

      const deviceProof=await signDeviceProof("shift",[action,service,employee]);
      const result=await shiftFunction({
        op:"shift",
        action,
        service,
        employee,
        pin,
        deviceToken:loadShiftDeviceToken(),
        deviceProof,
        expectedManager:expected?.manager||null,
        expectedMaster:expected?.master||null
      });

      await loadTodayShifts(false);

      const root=$("startupShiftContent");
      if(root){
        const word=action==="open"?"открыта":"закрыта";
        root.innerHTML=`
          <div class="startup-shift-done">
            <div class="big-check">✓</div>
            <b>Смена ${word}</b>
            <span>${action==="open"?"Открытие":"Закрытие"}: ${escapeHtml(result.localTime||moscowParts().time)}</span>
          </div>
          <button class="startup-shift-close" id="startupCloseAfterSuccess">Закрыть окно</button>`;
        const c=$("startupCloseAfterSuccess");
        if(c) c.onclick=closeStartupShiftWindow;
      }

      setTimeout(()=>{ try{ window.close(); }catch(e){} },2500);
    }catch(e){
      if(error) error.textContent=e.message||"Ошибка";
      if(btn){
        btn.disabled=false;
        btn.textContent=action==="open"?"ОТКРЫТЬ СМЕНУ":"ЗАКРЫТЬ СМЕНУ";
      }
    }
  }

  function renderTodayShifts(){
    const now=moscowParts();
    $("todayDateLabel").textContent=new Intl.DateTimeFormat("ru-RU",{timeZone:SHIFT_TIMEZONE,weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
    const services=isServiceDeviceMode() ? [serviceDeviceName()] : [settings.service1,settings.service2];
    const root=$("todayShiftCards"); root.innerHTML="";
    services.forEach(service=>{
      const row=currentShiftRows.find(x=>x.service===service) || null;
      const exp=expectedForDate(now.date,service);
      const soloMaster=!!(exp && isNoManagerValue(exp.manager));
      const masterActsAsManager=!!(exp && service===settings.service2 && exp.manager===exp.master && !isNoMasterValue(exp.master));
      const serviceStart=shiftStartForService(service);
      const serviceEnd=shiftEndForService(service);
      const currentMins=now.hour*60+now.minute, startMins=shiftMinutes(serviceStart), endMins=shiftMinutes(serviceEnd);
      let cls="wait", label="Ожидаем открытия", meta="";
      if(soloMaster){
        cls="open";
        label="Сегодня работает только мастер";
        meta="Менеджер и подтверждение открытия смены не требуются";
      }else if(row && row.opened_at && !row.closed_at){
        cls=(row.open_late_minutes||0)>0?"late":"open";
        label=`Открыта ${formatMoscowTime(row.opened_at)}`;
        meta=`Открыл: ${escapeHtml(row.opened_by||"—")}`;
        if(row.opened_by && exp && row.opened_by!==exp.manager) meta+=`<br><span class="mismatch">По графику: ${escapeHtml(exp.manager)}</span>`;
      }else if(row && row.closed_at){
        cls="closed"; label=`Закрыта ${formatMoscowTime(row.closed_at)}`;
        meta=`Открыл: ${escapeHtml(row.opened_by||"—")} ${formatMoscowTime(row.opened_at)}<br>Закрыл: ${escapeHtml(row.closed_by||"—")} ${formatMoscowTime(row.closed_at)}`;
      }else if(currentMins>=startMins){
        cls="missing"; label="Смена не открыта"; meta=masterActsAsManager?"Подтверждения от ответственного мастера ещё нет":"Подтверждения от менеджера ещё нет";
      }else{
        meta=`Начало смены в ${serviceStart}`;
      }
      const card=document.createElement("div");
      const todayServiceKey=serviceKeyForName(service);
      card.className=`shift-card ${todayServiceKey?`service-${todayServiceKey}`:""}`.trim();
      const pairText=exp
        ? (masterActsAsManager
          ? `Мастер: <strong>${escapeHtml(exp.master)}</strong><br>Отвечает за точку и открывает смену<br>${serviceStart}–${serviceEnd}`
          : soloMaster
            ? `Только мастер: <strong>${escapeHtml(exp.master)}</strong><br>Без менеджера<br>${serviceStart}–${serviceEnd}`
            : `Менеджер: <strong>${escapeHtml(exp.manager)}</strong><br>Мастер: <strong>${escapeHtml(exp.master)}</strong><br>${serviceStart}–${serviceEnd}`)
        : "График на эту дату не рассчитан";
      const action=soloMaster ? "done" : ((!row || !row.opened_at) ? "open" : (!row.closed_at ? "close" : "done"));
      const allowed=action!=="done" && canUseShiftService(service);
      let btnText=action==="open"?"Открыть смену":action==="close"?"Закрыть смену":"Смена закрыта";
      if(action!=="done" && !allowed) btnText=`Только на устройстве ${service}`;
      const employeeMode=isEmployeePhoneMode();
      const deviceNote=action!=="done" && !allowed && !isAdmin() && !employeeMode?`<div class="shift-device-note">С телефона сотрудника открыть или закрыть смену нельзя.</div>`:"";
      const actionHtml=employeeMode ? "" : `<button class="${action==="open"?"primary":"secondary"} shift-action" ${(!allowed || action==="done")?"disabled":""}>${btnText}</button>`;
      card.innerHTML=`<h3>${escapeHtml(service)}</h3><div class="shift-status ${cls}"><span class="dot"></span>${label}</div><div class="shift-pair">${pairText}</div><div class="shift-meta">${meta}</div>${deviceNote}${actionHtml}${isAdmin() && row ? `<button class="annul-shift-btn">Аннулировать смену</button>` : ""}`;
      if(allowed && !employeeMode) card.querySelector(".shift-action").onclick=()=>openShiftAction(service,action,exp);
      const annulBtn=card.querySelector(".annul-shift-btn");
      if(annulBtn) annulBtn.onclick=()=>annulTodayShift(service,now.date);
      root.appendChild(card);
    });
    renderAdminAttention();
    if(isStartupShiftMode()) renderStartupShiftWindow();
  }

  function renderAdminAttention(){
    const root=$("attentionList");
    if(!root) return;

    const now=moscowParts();
    const nowM=now.hour*60+now.minute;
    const problems=[];

    const attentionServices=isServiceDeviceMode() ? [serviceDeviceName()] : [settings.service1,settings.service2];
    for(const service of attentionServices){
      const row=currentShiftRows.find(x=>x.service===service)||null;
      const exp=expectedForDate(now.date,service);
      const serviceStart=shiftStartForService(service);
      const serviceEnd=shiftEndForService(service);
      const startM=shiftMinutes(serviceStart);
      const endM=shiftMinutes(serviceEnd);

      if(exp && isNoManagerValue(exp.manager)) continue;

      if(nowM>=startM+10 && !row?.opened_at){
        problems.push({kind:"bad",text:`${service}: смена не открыта после ${serviceStart}.`});
        continue;
      }

      if(row?.opened_at && (row.open_late_minutes||0)>0){
        problems.push({kind:"warn",text:`${service}: открыта с опозданием на ${row.open_late_minutes} мин.`});
      }

      if(row?.opened_by && exp?.manager && row.opened_by!==exp.manager){
        problems.push({kind:"warn",text:`${service}: открыл ${row.opened_by}, по графику менеджер ${exp.manager}.`});
      }

      if(nowM>=endM+15 && row?.opened_at && !row?.closed_at){
        problems.push({kind:"bad",text:`${service}: смена не закрыта после ${serviceEnd}.`});
      }

      if(row?.closed_at && (row.early_close_minutes||0)>0){
        problems.push({kind:"warn",text:`${service}: смена закрыта раньше графика на ${row.early_close_minutes} мин.`});
      }
    }

    const attentionSignature=`${isServiceDeviceMode()?serviceDeviceName():"all"}|${stableJson(problems)}`;
    if(attentionSignature===lastAttentionSignature) return;
    lastAttentionSignature=attentionSignature;

    const box=$("attentionBox");
    if(problems.length){
      root.innerHTML=problems.map(x=>`<div class="attention-item ${x.kind}">${escapeHtml(x.text)}</div>`).join("");
      if(box) box.classList.remove("hidden-clean");
    }else{
      root.innerHTML="";
      if(box) box.classList.add("hidden-clean");
    }
  }

  async function loadTodayShifts(showToast=false,force=false){
    if(!cloudConfigured()) return false;

    const nowMs=Date.now();
    if(!force && !showToast && nowMs-lastTodayShiftFetchAt<8000) return true;
    if(todayShiftRequestPromise) return todayShiftRequestPromise;

    todayShiftRequestPromise=(async()=>{
      const now=moscowParts();
      const date=now.date;

      try{
        const res=await authFetch(`/rest/v1/${SHIFT_TABLE}?shift_date=eq.${date}&voided_at=is.null&select=*&order=service.asc`,{method:"GET"});
        if(!res.ok) throw new Error(await res.text());
        const newRows=await res.json();
        lastTodayShiftFetchAt=Date.now();
        saveCachedTodayShifts(date,newRows);

        const mins=now.hour*60+now.minute;
        const startMins=shiftMinutes(settings.shiftStart);
        const endMins=shiftMinutes(settings.shiftEnd);
        const timePhase=mins<startMins ? "before" : (mins<endMins ? "during" : "after");
        const signature=`${date}|${timePhase}|${stableJson(newRows)}`;

        if(signature!==lastShiftSignature){
          lastShiftSignature=signature;
          currentShiftRows=newRows;
          const y=window.scrollY;

          const todayVisible=!$("adminTodayPage").classList.contains("hidden");
          if(todayVisible) renderTodayShifts();
          if(isEmployeePhoneMode() && employeeMobileView==="employeeToday") renderEmployeePages();
          if(!todayVisible) renderAdminAttention();

          restoreScrollAfterRender(y);
        }else{
          currentShiftRows=newRows;
          renderAdminAttention();
        }

        if(showToast) toast("Статус смен обновлён");
        return true;
      }catch(e){
        logAppError("today shifts load",e);
        if(showToast) toast("Не удалось обновить смены");
        return false;
      }
    })();

    try{
      return await todayShiftRequestPromise;
    }finally{
      todayShiftRequestPromise=null;
    }
  }

  async function annulTodayShift(service,date){
    if(!isAdmin()){ openLoginModal(); return; }
    const lockKey=`annul:${service}:${date}`;
    if(adminMutationLocks.has(lockKey)) return;
    if(!confirm(`Аннулировать смену «${service}» за ${date}?\n\nОна останется в истории с отметкой «Аннулирована», а после этого смену можно будет открыть заново.`)) return;
    adminMutationLocks.add(lockKey);
    try{
      await shiftFunction({
        op:"annul-shift",
        service,
        date,
        reason:"Аннулировано администратором из приложения"
      },{admin:true});
      lastShiftSignature="";
      await loadTodayShifts(false);
      if(!$("historyPage").classList.contains("hidden")) await loadHistory();
      toast(`${service}: смена аннулирована`);
    }catch(e){
      console.error(e);
      toast(e.message || "Не удалось аннулировать смену");
    }finally{
      adminMutationLocks.delete(lockKey);
    }
  }

  function openShiftAction(service,action,expected){
    if(!canUseShiftService(service)){
      toast(`Открытие смены доступно только на устройстве ${service}`);
      return;
    }
    pendingShiftAction={service,action,expected};
    $("shiftActionTitle").textContent=action==="open"?`Открыть смену — ${service}`:`Закрыть смену — ${service}`;
    $("shiftActionInfo").innerHTML=expected
      ? (service===settings.service2 && expected.manager===expected.master
        ? `По графику сегодня отвечает: <b>${escapeHtml(expected.master)}</b>`
        : `По графику сегодня: <b>${escapeHtml(expected.manager)} + ${escapeHtml(expected.master)}</b>`)
      : "На эту дату автоматический график не найден. Смену можно подтвердить вручную.";
    const names=(expected && expected.manager && moscowParts().date>=MANAGER_ROSTER_FROM) ? [expected.manager] : activeManagerNames();
    $("shiftEmployee").innerHTML=names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    if(expected && names.includes(expected.manager)) $("shiftEmployee").value=expected.manager;
    $("shiftPin").value=""; $("shiftActionError").textContent="";
    $("shiftPinField").classList.toggle("hidden",isAdmin());
    $("adminShiftNotice").classList.toggle("hidden",!isAdmin());
    $("shiftActionModal").classList.remove("hidden");
    if(!isAdmin()) setTimeout(()=>$("shiftPin").focus(),100);
  }
  function closeShiftAction(){ $("shiftActionModal").classList.add("hidden"); pendingShiftAction=null; }
  async function confirmShiftAction(){
    if(!pendingShiftAction) return;
    const employee=$("shiftEmployee").value, pin=$("shiftPin").value.trim();
    const adminMode=isAdmin();
    if(!adminMode && !isValidShiftPin(pin)){ $("shiftActionError").textContent="PIN должен быть из 4 цифр"; return; }

    const btn=$("confirmShiftAction"); btn.disabled=true; btn.textContent="Отправка…"; $("shiftActionError").textContent="";
    try{
      const p=pendingShiftAction;
      if(!adminMode && !canUseShiftService(p.service)) throw new Error("Это устройство не разрешено для этой точки");

      if(!adminMode && p.expected?.manager && employee!==p.expected.manager){
        const verb=p.action==="open" ? "открываете" : "закрываете";
        const ok=confirm(`По графику сегодня менеджер ${p.expected.manager}.\n\nВы ${verb} смену как ${employee}. Продолжить?`);
        if(!ok) return;
      }

      const deviceProof=adminMode ? null : await signDeviceProof("shift",[p.action,p.service,employee]);
      const body={
        op:"shift",
        action:p.action,
        service:p.service,
        employee,
        pin:adminMode?"":pin,
        deviceToken:adminMode?"":loadShiftDeviceToken(),
        deviceProof,
        expectedManager:p.expected?.manager||null,
        expectedMaster:p.expected?.master||null
      };
      const result=await shiftFunction(body,{admin:adminMode});
      closeShiftAction();
      await loadTodayShifts(false);
      toast(p.action==="open"?`Смена открыта в ${result.localTime||""}`:`Смена закрыта в ${result.localTime||""}`);
      if(!$("historyPage").classList.contains("hidden")) loadHistory();
    }catch(e){ $("shiftActionError").textContent=e.message || "Ошибка"; }
    finally{ btn.disabled=false; btn.textContent="Подтвердить"; }
  }

  function renderPinFields(){
    const root=$("pinFields"); if(!root) return;
    root.innerHTML=activeManagerNames().map((n,i)=>`<div class="pin-grid"><div class="field" style="margin:0"><label>${escapeHtml(n)}</label><input class="readonly" value="${["Георгий","Асик"].includes(n)?"Мастер Новы / ответственный":"Менеджер"}" readonly></div><div class="field" style="margin:0"><label>Новый PIN</label><input id="managerPin${i}" type="password" inputmode="numeric" maxlength="4" placeholder="4 цифры"></div></div>`).join("");
  }

  async function saveManagerPins(){
    if(!isAdmin()){ openLoginModal(); return; }
    const names=activeManagerNames();
    const updates=names.map((name,i)=>({name,pin:$(`managerPin${i}`).value.trim(),index:i})).filter(x=>x.pin);
    if(!updates.length){ toast("Новые PIN не введены"); return; }

    const invalid=updates.find(x=>!isValidShiftPin(x.pin));
    if(invalid){
      toast(`PIN для ${invalid.name} должен быть из 4 цифр`);
      return;
    }

    if(!confirm(`Изменить PIN у ${updates.length} менеджер${updates.length===1?"а":"ов"}?\n\nСтарые PIN перестанут работать сразу.`)) return;

    const busy=beginButtonBusy("savePinsBtn","Сохраняем PIN…");
    if(!busy) return;

    let changed=0;
    try{
      for(const item of updates){
        await shiftFunction({op:"set-pin",employee:item.name,pin:item.pin},{admin:true});
        $(`managerPin${item.index}`).value="";
        changed++;
      }
      toast(`PIN сохранены: ${changed}`);
    }catch(e){
      console.error(e);
      toast(changed
        ? `Сохранено PIN: ${changed}. Остальные не изменены — повтори попытку.`
        : (e.message||"Не удалось сохранить PIN"));
    }finally{
      endButtonBusy(busy);
    }
  }

  function isStandaloneApp(){
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone===true;
  }

  function updateInstallUI(){
    const grafik=$("installGrafikBtn");
    const state=$("installAppState");

    const installed=isStandaloneApp() || grafikAppInstalled;


    if(grafik){
      grafik.textContent=installed ? "MA График уже установлен" : "Установить MA График";
      grafik.disabled=installed;
    }

    const installSection=$("installAppsSection");
    if(installSection) installSection.classList.toggle("hidden",installed);

    if(state){
      if(installed){
        state.textContent="MA График уже открыт как установленное приложение.";
        state.className="install-app-state ok";
      }else if(deferredGrafikInstallPrompt){
        state.textContent="Chrome готов установить MA График как обычное приложение Windows.";
        state.className="install-app-state ok";
      }else if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){
        state.textContent="На iPhone: нажми «Поделиться» → «На экран Домой».";
        state.className="install-app-state warn";
      }else{
        state.textContent="Если системное окно установки не появится, открой меню Chrome → «Установить приложение».";
        state.className="install-app-state";
      }
    }
  }

  async function installGrafikApp(){
    if(isStandaloneApp() || grafikAppInstalled){
      toast("MA График уже установлен");
      return;
    }

    if(deferredGrafikInstallPrompt){
      const promptEvent=deferredGrafikInstallPrompt;
      deferredGrafikInstallPrompt=null;
      promptEvent.prompt();
      const choice=await promptEvent.userChoice;
      if(choice?.outcome==="accepted"){
        grafikAppInstalled=true;
        toast("MA График установлен");
      }
      updateInstallUI();
      return;
    }

    if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){
      alert("На iPhone:\n\n1. Нажми кнопку «Поделиться» в Safari.\n2. Выбери «На экран Домой».\n3. Нажми «Добавить».");
      return;
    }

    alert("Chrome пока не показал системную установку.\n\nОткрой меню Chrome ⋮ и выбери «Установить MA График» или «Установить приложение».");
  }


  function urlBase64ToUint8Array(base64String){
    const padding="=".repeat((4-base64String.length%4)%4); const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
    const raw=atob(base64); return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
  function updatePushState(){
    const el=$("pushState"), btn=$("enablePushBtn"); if(!el||!btn) return;
    const standalone=window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone===true;
    if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){
      el.textContent="На этом устройстве Web Push сейчас недоступен. На iPhone сначала добавь сайт на экран «Домой» и открой его оттуда."; btn.disabled=true; updateSettingsSystemStatus(); return;
    }
    if(Notification.permission==="granted") el.textContent="Уведомления разрешены. Нажми кнопку, чтобы проверить/зарегистрировать этот телефон.";
    else if(Notification.permission==="denied") el.textContent="Уведомления запрещены в настройках браузера/системы.";
    else el.textContent=standalone?"Уведомления ещё не включены на этом телефоне.":"На iPhone для push добавь сайт на экран «Домой», затем открой приложение и включи уведомления.";
    btn.disabled=false;
    updateSettingsSystemStatus();
  }
  async function registerServiceWorker({checkUpdate=true}={}){
    if(!("serviceWorker" in navigator)) return null;
    try{
      const hadController=!!navigator.serviceWorker.controller;
      serviceWorkerRegistration=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});

      if(hadController && !serviceWorkerControllerListenerBound){
        serviceWorkerControllerListenerBound=true;
        navigator.serviceWorker.addEventListener("controllerchange",()=>{
          if(serviceWorkerReloading) return;
          const last=Number(sessionStorage.getItem("ma_grafik_sw_reload_at")||0);
          if(Date.now()-last<10000) return;
          serviceWorkerReloading=true;
          sessionStorage.setItem("ma_grafik_sw_reload_at",String(Date.now()));
          location.reload();
        });
      }

      if(checkUpdate && Date.now()-lastServiceWorkerUpdateAt>60000){
        lastServiceWorkerUpdateAt=Date.now();
        try{ await serviceWorkerRegistration.update(); }catch(e){ logAppError("service worker update",e); }
      }
      if(serviceWorkerRegistration.waiting){
        try{ serviceWorkerRegistration.waiting.postMessage({type:"SKIP_WAITING"}); }catch(_){ }
      }
      return serviceWorkerRegistration;
    }catch(e){
      logAppError("service worker register",e);
      return null;
    }
  }
  async function enablePush(){
    if(!isAdmin()){ openLoginModal(); toast("Сначала войди как администратор"); return; }
    if(!("Notification" in window)){ toast("На iPhone сначала добавь сайт на экран «Домой»"); return; }
    const busy=beginButtonBusy("enablePushBtn","Включаем…");
    if(!busy) return;
    try{
      const perm=await Notification.requestPermission(); if(perm!=="granted") throw new Error("Уведомления не разрешены");
      const reg=serviceWorkerRegistration || await registerServiceWorker(); if(!reg) throw new Error("Service Worker не зарегистрирован");
      let sub=await reg.pushManager.getSubscription();
      if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
      await shiftFunction({op:"subscribe",subscription:sub.toJSON()},{admin:true});
      toast("Push-уведомления включены на этом телефоне");
    }catch(e){
      console.error(e);
      toast(e.message||"Не удалось включить push");
    }finally{
      endButtonBusy(busy);
      updatePushState();
    }
  }

  async function updateEmployeeReminderState(){
    const state=$("employeeReminderState");
    const enable=$("enableEmployeeReminders");
    const disable=$("disableEmployeeReminders");
    if(!state||!enable||!disable) return;

    const name=selectedEmployee();
    if(!name){
      state.textContent="Сначала выбери сотрудника.";
      state.className="employee-reminder-state employee-reminder-warn";
      enable.disabled=true;
      disable.classList.add("hidden");
      return;
    }

    const standalone=window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone===true;
    if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){
      state.textContent="На этом телефоне push-уведомления недоступны.";
      state.className="employee-reminder-state employee-reminder-bad";
      enable.disabled=true;
      disable.classList.add("hidden");
      return;
    }

    if(Notification.permission==="denied"){
      state.textContent="Уведомления запрещены в настройках телефона.";
      state.className="employee-reminder-state employee-reminder-bad";
      enable.disabled=true;
      disable.classList.add("hidden");
      return;
    }

    const reg=serviceWorkerRegistration || await registerServiceWorker();
    const sub=reg ? await reg.pushManager.getSubscription() : null;
    const linked=employeePushName();

    if(sub && Notification.permission==="granted" && linked===name){
      state.textContent=`Включены для ${name}. Напомним вечером, за 1 час и за 15 минут до смены.`;
      state.className="employee-reminder-state employee-reminder-ok";
      enable.textContent="Напоминания включены";
      enable.disabled=true;
      disable.classList.remove("hidden");
      return;
    }

    enable.disabled=false;
    disable.classList.add("hidden");
    enable.textContent=linked && linked!==name ? `Переключить на ${name}` : "Включить напоминания";

    if(linked && linked!==name){
      state.textContent=`Этот телефон сейчас подписан на напоминания для ${linked}.`;
      state.className="employee-reminder-state employee-reminder-warn";
    }else if(!standalone && /iPhone|iPad|iPod/i.test(navigator.userAgent)){
      state.textContent="На iPhone сначала добавь приложение на экран «Домой», открой его оттуда и нажми «Включить».";
      state.className="employee-reminder-state employee-reminder-warn";
    }else{
      state.textContent="Выключены. Нажми «Включить напоминания» один раз.";
      state.className="employee-reminder-state";
    }
  }

  async function enableEmployeeReminders(){
    const name=selectedEmployee();
    if(!name){ openEmployeePicker(); return; }
    if(!("Notification" in window)){ toast("На этом телефоне уведомления недоступны"); return; }

    const btn=$("enableEmployeeReminders");
    if(btn.dataset.busy==="1") return;
    btn.dataset.busy="1";
    btn.disabled=true;
    btn.textContent="Включаем…";

    try{
      const perm=await Notification.requestPermission();
      if(perm!=="granted") throw new Error("Уведомления не разрешены");

      const reg=serviceWorkerRegistration || await registerServiceWorker();
      if(!reg) throw new Error("Не удалось запустить уведомления");

      let sub=await reg.pushManager.getSubscription();
      if(!sub){
        sub=await reg.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      await shiftFunction({
        op:"subscribe-employee",
        employee:name,
        subscription:sub.toJSON()
      });

      saveEmployeePushName(name);
      toast(`Напоминания для ${name} включены`);
    }catch(e){
      console.error(e);
      toast(e.message||"Не удалось включить напоминания");
    }finally{
      btn.dataset.busy="";
      await updateEmployeeReminderState();
    }
  }

  async function disableEmployeeReminders(){
    const btn=$("disableEmployeeReminders");
    if(btn.dataset.busy==="1") return;
    btn.dataset.busy="1";
    btn.disabled=true;
    btn.textContent="Выключаем…";
    try{
      const reg=serviceWorkerRegistration || await registerServiceWorker();
      const sub=reg ? await reg.pushManager.getSubscription() : null;
      if(sub){
        await shiftFunction({
          op:"unsubscribe-employee",
          employee:employeePushName()||selectedEmployee(),
          endpoint:sub.endpoint
        });
        await sub.unsubscribe();
      }
      saveEmployeePushName("");
      toast("Напоминания выключены");
    }catch(e){
      console.error(e);
      toast(e.message||"Не удалось выключить напоминания");
    }finally{
      btn.dataset.busy="";
      await updateEmployeeReminderState();
    }
  }

  async function fetchAllHistoryRows(baseQuery,token){
    const pageSize=300;
    const maxRows=6000;
    let offset=0;
    const all=[];
    historyRowsTruncated=false;

    while(all.length<maxRows){
      const limit=Math.min(pageSize,maxRows-all.length);
      const joiner=baseQuery.includes("?")?"&":"?";
      const url=`${baseQuery}${joiner}limit=${limit}&offset=${offset}`;
      const res=await authFetch(url,{method:"GET",headers:{Authorization:"Bearer "+token}});
      if(!res.ok) throw new Error(await res.text());
      const part=await res.json();
      all.push(...part);
      if(part.length<limit) return all;
      offset+=part.length;
    }

    // Ровно на границе делаем дешёвую проверку одной следующей записи,
    // чтобы не показывать ложное предупреждение при ровно 6000 записях.
    const joiner=baseQuery.includes("?")?"&":"?";
    const probeUrl=`${baseQuery}${joiner}limit=1&offset=${offset}`;
    const probe=await authFetch(probeUrl,{method:"GET",headers:{Authorization:"Bearer "+token}});
    if(!probe.ok) throw new Error(await probe.text());
    const extra=await probe.json();
    historyRowsTruncated=Array.isArray(extra) && extra.length>0;
    return all;
  }

  async function loadKpi(){
    const seq=++kpiLoadSeq;
    const list=$("kpiList"),summary=$("kpiSummary"),notice=$("kpiNotice"),loading=$("kpiLoading");
    if(!list||!summary) return;

    if(!isAdmin()){
      summary.innerHTML="";
      list.innerHTML='<div class="kpi-empty">Войди как администратор, чтобы смотреть KPI сотрудников.</div>';
      if(notice) notice.textContent="KPI доступен только владельцу/администратору.";
      return;
    }
    if(!cloudConfigured()){
      summary.innerHTML="";
      list.innerHTML='<div class="kpi-empty">KPI требует подключённое облако смен.</div>';
      if(notice) notice.textContent="Без фактических открытий и закрытий KPI считать нельзя.";
      return;
    }

    const month=$("kpiMonth")?.value || moscowParts().date.slice(0,7);
    const range=kpiCore.monthRange(month);
    if(!range){ list.innerHTML='<div class="kpi-empty">Выбери месяц.</div>'; return; }
    if($("kpiMonth") && !$("kpiMonth").value) $("kpiMonth").value=month;

    if(loading) loading.classList.remove("hidden");
    list.innerHTML="";
    try{
      const token=await getAdminToken();
      const kpiHistoryFrom=range.from<"2026-09-01"?range.from:"2026-09-01";
      const query=`/rest/v1/${SHIFT_TABLE}?select=*&shift_date=gte.${kpiHistoryFrom}&shift_date=lte.${range.to}&order=shift_date.asc,service.asc&limit=2000`;
      const res=await authFetch(query,{method:"GET",headers:{Authorization:"Bearer "+token}});
      if(!res.ok) throw new Error(await res.text());
      const rows=await res.json();
      if(seq!==kpiLoadSeq) return;
      const result=kpiCore.calculate(rows,{from:range.from,to:range.to,now:moscowParts()});
      kpiCore.render(result,{summaryEl:summary,listEl:list,noticeEl:notice});
    }catch(e){
      if(seq!==kpiLoadSeq) return;
      logAppError("kpi load",e,{month});
      summary.innerHTML="";
      list.innerHTML='<div class="kpi-empty">Не удалось загрузить KPI. Нажми «Обновить».</div>';
      if(notice) notice.textContent=e?.message||"Ошибка загрузки KPI";
    }finally{
      if(seq===kpiLoadSeq && loading) loading.classList.add("hidden");
    }
  }

  async function loadHistory(){
    const loadSeq=++historyLoadSeq;
    const root=$("historyList");
    if(!isAdmin()){
      root.innerHTML='<div class="history-empty">Войди как администратор, чтобы смотреть историю.</div>';
      if($("historyStats")) $("historyStats").innerHTML="";
      return;
    }

    $("historyLegendS1").textContent=settings.service1;
    $("historyLegendS2").textContent=settings.service2;

    const from=$("historyFrom").value;
    const to=$("historyTo").value;
    if(from && to && from>to){
      toast("Дата «с» не может быть позже даты «по»");
      return;
    }
    const service=$("historyService").value;
    const employee=$("historyEmployee").value;
    const problem=$("historyProblem").value;

    const token=await getAdminToken();
    if(!token){ openLoginModal(); return; }

    let q=`/rest/v1/${SHIFT_TABLE}?select=*&order=shift_date.desc,service.asc,id.desc`;
    if(from) q+=`&shift_date=gte.${encodeURIComponent(from)}`;
    if(to) q+=`&shift_date=lte.${encodeURIComponent(to)}`;
    if(service) q+=`&service=eq.${encodeURIComponent(service)}`;

    try{
      root.innerHTML='<div class="history-empty">Загрузка истории…</div>';

      let rows=await fetchAllHistoryRows(q,token);
      if(loadSeq!==historyLoadSeq) return;

      if(employee){
        rows=rows.filter(r=>
          r.opened_by===employee ||
          r.closed_by===employee ||
          r.expected_manager===employee
        );
      }

      if(problem==="problems") rows=rows.filter(historyIsProblem);
      if(problem==="late") rows=rows.filter(r=>!r.voided_at && (r.open_late_minutes||0)>0);
      if(problem==="unclosed") rows=rows.filter(r=>!r.voided_at && r.opened_at&&!r.closed_at);
      if(problem==="voided") rows=rows.filter(r=>!!r.voided_at);

      renderHistoryStats(rows);
      renderHistory(rows);
      if(historyRowsTruncated){
        root.insertAdjacentHTML("afterbegin",'<div class="notice" style="margin-bottom:8px">Период слишком большой: показаны первые 6000 записей. Выберите более короткий период, чтобы статистика была полной.</div>');
      }
    }catch(e){
      if(loadSeq!==historyLoadSeq) return;
      console.error(e);
      root.innerHTML='<div class="history-empty">Не удалось загрузить историю.</div>';
      if($("historyStats")) $("historyStats").innerHTML="";
    }
  }

  function openEditShift(row){
    if(!row) return;
    editingShiftRow=row;
    $("editShiftId").value=row.id;
    $("editShiftInfo").textContent=`${row.service} · ${row.shift_date}`;

    fillEditManagerSelect($("editOpenedBy"),row.opened_by||row.expected_manager||"",false);
    fillEditManagerSelect($("editClosedBy"),row.closed_by||"",true);

    $("editOpenedTime").value=row.opened_at?formatMoscowTime(row.opened_at):"";
    $("editClosedTime").value=row.closed_at?formatMoscowTime(row.closed_at):"";
    $("editShiftModal").classList.remove("hidden");
  }
  function closeEditShift(){ $("editShiftModal").classList.add("hidden"); editingShiftRow=null; }
  async function saveEditShift(){
    if(!editingShiftRow||!isAdmin()) return;
    const date=editingShiftRow.shift_date;
    const openedTime=$("editOpenedTime").value, closedTime=$("editClosedTime").value;
    const patch={opened_by:$("editOpenedBy").value.trim()||null,opened_at:openedTime?isoAtMoscow(date,openedTime):null,closed_by:$("editClosedBy").value.trim()||null,closed_at:closedTime?isoAtMoscow(date,closedTime):null,updated_at:new Date().toISOString()};
    if(!patch.opened_at){ toast("Время открытия нельзя удалить"); return; }
    if(!patch.opened_by){ toast("Укажи, кто открыл смену"); return; }
    if(patch.closed_at && !patch.closed_by){ toast("Укажи, кто закрыл смену"); return; }
    if(patch.closed_at && new Date(patch.closed_at) < new Date(patch.opened_at)){ toast("Закрытие не может быть раньше открытия"); return; }
    patch.open_late_minutes=Math.max(0,shiftMinutes(openedTime)-shiftMinutes(settings.shiftStart));
    patch.early_close_minutes=closedTime?Math.max(0,shiftMinutes(settings.shiftEnd)-shiftMinutes(closedTime)):0;

    const busy=beginButtonBusy("saveEditShift","Сохраняем…");
    if(!busy) return;
    try{
      const token=await getAdminToken();
      if(!token){ openLoginModal(); throw new Error("Сессия администратора закончилась"); }
      const res=await authFetch(`/rest/v1/${SHIFT_TABLE}?id=eq.${editingShiftRow.id}`,{method:"PATCH",headers:{Authorization:"Bearer "+token,Prefer:"return=minimal"},body:JSON.stringify(patch)});
      if(!res.ok) throw new Error(await res.text());
      closeEditShift();
      toast("История исправлена");
      await loadHistory();
      await loadTodayShifts(false);
    }catch(e){
      console.error(e);
      toast(e.message==="Сессия администратора закончилась" ? e.message : "Не удалось сохранить исправление");
    }finally{
      endButtonBusy(busy);
    }
  }

  function markDirty(){
    settingsDirty=true;
    $("saveBadge").textContent = "Есть изменения";
    $("saveBadge").classList.remove("online","offline","syncing");
  }

  function toast(msg){
    const el=$("toast"); el.textContent=msg; el.classList.add("show");
    clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2200);
  }

  function addMonths(y,m,delta){
    const d = new Date(y, m+delta, 1);
    return {year:d.getFullYear(), month:d.getMonth()};
  }

  function anchorParts(){
    const [y,m,d]=String(settings.anchorDate||DEFAULTS.anchorDate).split("-").map(Number);
    return {year:y,month:m-1,day:d};
  }

  function monthInfo(index){
    const a=anchorParts();
    const x=addMonths(a.year,a.month,index);
    return {index, year:x.year, month:x.month, name:MONTHS[x.month], days:new Date(x.year,x.month+1,0).getDate()};
  }

  function monthIndexForYearMonth(year,month){
    const a=anchorParts();
    return (Number(year)-a.year)*12 + (Number(month)-a.month);
  }

  function getCurrentMonthIndex(){
    const p=new Intl.DateTimeFormat("en-US",{timeZone:SHIFT_TIMEZONE,year:"numeric",month:"2-digit"}).formatToParts(new Date());
    const vals=Object.fromEntries(p.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
    return monthIndexForYearMonth(Number(vals.year),Number(vals.month)-1);
  }

  function todayMonthLabel(){
    const idx=getCurrentMonthIndex(), mi=monthInfo(idx);
    return `${mi.name} ${mi.year}`;
  }

  function navigateVisibleMonth(direction){
    const next=currentIndex+direction;
    const mi=monthInfo(next);
    if(mi.year<2020 || mi.year>2100) return;
    currentIndex=next;
    userSelectedMonth=true;
    renderMonth();
  }

  const {
    scheduleStartDate,globalDayIndex,mod,dateKeyFromDate,dateDiffDays,
    employeeCycleForDate,employeeWorksOnDate,employeesForDate,employeeServiceForDate,
    legacyTeamsForDate,legacyBaseScheduleForDate,standardBaseScheduleForDate,sameRoster,
    legacyMasterPlanBeforeRemoval,fixedMasterPlanForDate,balancedRosterState,
    isBalancedRosterRole,isNovaWeekendRule,isNoManagerValue,isNoMasterValue,
    baseScheduleForDate,daySchedule
  }=window.MASchedule.create({
    getSettings:()=>settings,
    anchorParts,
    monthInfo,
    serviceKeyForName,
    dateObjectFromKey,
    MASTER_ROSTER_FROM,
    MANAGER_ROSTER_FROM,
    REMOVED_MANAGER_NAME
  });

  let monthRowsCacheSignature="";
  const monthRowsCache=new Map();
  function buildMonthRows(monthIndex){
    const settingsSignature=stableJson(settings);
    if(settingsSignature!==monthRowsCacheSignature){
      monthRowsCache.clear();
      monthRowsCacheSignature=settingsSignature;
    }
    if(monthRowsCache.has(monthIndex)) return monthRowsCache.get(monthIndex);

    const info=monthInfo(monthIndex), rows=[];
    for(let d=1;d<=info.days;d++) rows.push(daySchedule(monthIndex,d));
    monthRowsCache.set(monthIndex,rows);
    if(monthRowsCache.size>24){
      const oldestKey=monthRowsCache.keys().next().value;
      monthRowsCache.delete(oldestKey);
    }
    return rows;
  }

  const {
    activeEmployeesForDate,activeEmployeeNames,activeManagerNames,allHistoricalManagerNames,
    loadEmployeeName,saveEmployeeName,employeePushName,saveEmployeePushName,selectedEmployee,
    dateKeyLocal,employeeAssignmentForDate,employeeUpcomingShifts,employeeServiceState,
    employeeNamesInMonth,monthHasUnassigned
  }=window.MAEmployees.create({
    getSettings:()=>settings,
    moscowParts,
    dateObjectFromKey,
    employeesForDate,
    MANAGER_ROSTER_FROM,
    EMPLOYEE_STORAGE_KEY,
    EMPLOYEE_PUSH_NAME_KEY,
    expectedForDate,
    getCurrentMonthIndex,
    monthInfo,
    buildMonthRows,
    isNoManagerValue,
    isNoMasterValue,
    getCurrentShiftRows:()=>currentShiftRows,
    shiftStartForService,
    shiftMinutes,
    formatMoscowTime,
    escapeHtml
  });

  function renderEmployeeToday(){
    if(!isEmployeePhoneMode()) return;
    const name=selectedEmployee();
    if(!name) return;

    const now=moscowParts();
    const todayAssignment=employeeAssignmentForDate(name,now.date);

    $("employeeTodayDate").textContent=new Intl.DateTimeFormat("ru-RU",{
      timeZone:SHIFT_TIMEZONE,
      weekday:"long",
      day:"numeric",
      month:"long"
    }).format(new Date());

    const work=$("employeeTodayWork");
    if(todayAssignment){
      const partner=todayAssignment.pair.manager===name
        ? todayAssignment.pair.master
        : todayAssignment.pair.manager;
      const solo=isNoManagerValue(partner) || partner===name;

      const state=employeeServiceState(todayAssignment.service);
      let shiftText="Смена ещё не открыта";
      if(state.cls==="open" || state.cls==="late"){
        shiftText=`Смена открыта ${state.label.replace(/^Открыта\s*/,"в ")}`;
      }else if(state.cls==="closed"){
        shiftText=`Смена ${state.label.toLowerCase()}`;
      }else if(state.cls==="wait"){
        shiftText=`Смена начинается в ${shiftStartForService(todayAssignment.service)}`;
      }else if(state.cls==="solo"){
        shiftText="Выходной день Новы: менеджер не требуется";
      }

      const employeeServiceKey=serviceKeyForName(todayAssignment.service);
      work.className=`employee-main-status work ${employeeServiceKey?`service-${employeeServiceKey}`:""}`.trim();
      work.innerHTML=`
        <b>Сегодня работаю</b>
        <span><strong>${escapeHtml(todayAssignment.service)}</strong> · ${shiftStartForService(todayAssignment.service)}–${shiftEndForService(todayAssignment.service)}<br>${partner===name?"Работаю один · отвечаю за точку и смену":solo?"Работаю один, без менеджера":`Напарник: <strong>${escapeHtml(partner)}</strong>`}</span>
        <span class="employee-own-shift-status">${escapeHtml(shiftText)}</span>
      `;
    }else{
      work.className="employee-main-status off";
      work.innerHTML=`<b>Сегодня выходной</b>`;
    }

    const next=employeeUpcomingShifts(name,{afterToday:true,limit:1})[0];
    $("employeeNextShift").innerHTML=next
      ? `<small>Следующая смена</small><b>${new Intl.DateTimeFormat("ru-RU",{weekday:"short",day:"numeric",month:"long"}).format(next.date)} · ${escapeHtml(next.service)} · ${settings.shiftStart}–${settings.shiftEnd}</b>`
      : `<small>Следующая смена</small><b>Ближайшие смены не найдены</b>`;
  }

  function renderEmployeeMySchedule(){
    if(!isEmployeePhoneMode()) return;
    const name=selectedEmployee();
    if(!name) return;
    const list=employeeUpcomingShifts(name,{afterToday:false,limit:20});
    $("employeeShiftList").innerHTML=list.length ? list.map(x=>{
      const partner=x.pair.manager===name ? x.pair.master : x.pair.manager;
      const solo=isNoManagerValue(partner) || partner===name;
      const serviceKey=serviceKeyForName(x.service);
      return `<div class="employee-shift-item ${serviceKey?`service-${serviceKey}`:""}">
        <div class="employee-shift-date"><b>${x.date.getDate()}</b><span>${MONTHS[x.date.getMonth()].slice(0,3)} · ${WD[x.date.getDay()]}</span></div>
        <div class="employee-shift-info"><b>${escapeHtml(x.service)} · ${shiftStartForService(x.service)}–${shiftEndForService(x.service)}</b><span>${partner===name?"Работаю один · отвечаю за точку и смену":solo?"Работаю один, без менеджера":`Вместе с ${escapeHtml(partner)}`}</span></div>
      </div>`;
    }).join("") : '<div class="notice">Ближайшие смены не найдены.</div>';
  }

  function setEmployeeCalendarMonth(index){
    const mi=monthInfo(index);
    if(mi.year<2020 || mi.year>2100) return;
    employeeCalendarIndex=index;
    const today=moscowParts().date;
    const [ty,tm]=today.split("-").map(Number);
    if(mi.year===ty && mi.month===tm-1){
      employeeCalendarSelectedDate=today;
    }else{
      employeeCalendarSelectedDate=`${mi.year}-${String(mi.month+1).padStart(2,"0")}-01`;
    }
    renderEmployeeCalendar();
  }

  function renderEmployeeCalendarDetail(dateStr){
    const root=$("employeeCalendarDetail");
    if(!root) return;
    const name=selectedEmployee();
    if(!name){ root.innerHTML=""; return; }

    const [y,m,d]=dateStr.split("-").map(Number);
    const date=new Date(y,m-1,d);
    const title=new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(date);

    const assignment=employeeAssignmentForDate(name,dateStr);
    if(!assignment){
      root.className="employee-calendar-detail";
      root.innerHTML=`<b>${escapeHtml(title)} — выходной</b><span>По графику смены нет.</span>`;
      return;
    }

    const serviceKey=serviceKeyForName(assignment.service);
    root.className=`employee-calendar-detail ${serviceKey?`service-${serviceKey}`:""}`.trim();

    const partner=assignment.pair.manager===name ? assignment.pair.master : assignment.pair.manager;
    const solo=isNoManagerValue(partner);
    root.innerHTML=`<b>${escapeHtml(title)} — работаю</b><span>${escapeHtml(assignment.service)} · ${shiftStartForService(assignment.service)}–${shiftEndForService(assignment.service)}<br>${partner===name?"Работаю один · отвечаю за точку и смену":solo?"Работаю один, без менеджера":`Напарник: ${escapeHtml(partner)}`}</span>`;
  }

  function renderEmployeeCalendar(){
    if(!isEmployeePhoneMode()) return;
    const name=selectedEmployee();
    if(!name) return;

    let info=monthInfo(employeeCalendarIndex);
    if(info.year<2020 || info.year>2100){
      employeeCalendarIndex=getCurrentMonthIndex();
      info=monthInfo(employeeCalendarIndex);
    }
    $("employeeCalLabel").textContent=`${info.name} ${info.year}`;
    $("employeeLegendS1").textContent=settings.service1;
    $("employeeLegendS2").textContent=settings.service2;
    $("employeeCalPrev").disabled=info.year<=2020 && info.month===0;
    $("employeeCalNext").disabled=info.year>=2100 && info.month===11;
    const firstDow=(new Date(info.year,info.month,1).getDay()+6)%7;
    const today=moscowParts().date;
    const cells=[];

    for(let i=0;i<firstDow;i++){
      cells.push('<div class="employee-cal-cell blank"></div>');
    }

    for(let day=1;day<=info.days;day++){
      const dateStr=`${info.year}-${String(info.month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      let cls="off", status="Выходной";

      const assignment=employeeAssignmentForDate(name,dateStr);
      if(assignment){
        const serviceKey=serviceKeyForName(assignment.service);
        cls=`work ${serviceKey?`service-${serviceKey}`:""}`.trim();
        status=assignment.service;
      }

      if(dateStr===today) cls+=" today";
      cells.push(`<button class="employee-cal-cell ${cls}" data-date="${dateStr}"><b>${day}</b><span>${escapeHtml(status)}</span></button>`);
    }

    $("employeeCalendarGrid").innerHTML=cells.join("");
    $("employeeCalendarGrid").querySelectorAll("[data-date]").forEach(btn=>{
      btn.onclick=()=>{
        employeeCalendarSelectedDate=btn.dataset.date;
        renderEmployeeCalendarDetail(employeeCalendarSelectedDate);
      };
    });

    const selected=employeeCalendarSelectedDate;
    const selectedPrefix=`${info.year}-${String(info.month+1).padStart(2,"0")}-`;
    if(!selected || !selected.startsWith(selectedPrefix)){
      employeeCalendarSelectedDate=`${info.year}-${String(info.month+1).padStart(2,"0")}-01`;
    }
    renderEmployeeCalendarDetail(employeeCalendarSelectedDate);
  }


  function setDesktopCalendarMonth(index){
    const info=monthInfo(index);
    if(info.year<2020 || info.year>2100) return;
    desktopCalendarIndex=index;

    const today=moscowParts().date;
    const [ty,tm]=today.split("-").map(Number);
    if(info.year===ty && info.month===tm-1){
      desktopCalendarSelectedDate=today;
    }else{
      desktopCalendarSelectedDate=`${info.year}-${String(info.month+1).padStart(2,"0")}-01`;
    }
    renderDesktopCalendar();
  }

  function desktopCalendarServices(){
    if(isServiceDeviceMode()){
      const service=serviceDeviceName();
      return service ? [service] : [];
    }
    return [settings.service1,settings.service2];
  }

  function calendarPairText(pair){
    if(!pair) return "Нет графика";
    if(pair.manager===pair.master && !isNoMasterValue(pair.master)) return `Только ${pair.master} · отвечает за точку`;
    if(isNoManagerValue(pair.manager)) return `Только ${pair.master}`;
    if(isNoMasterValue(pair.master)) return `${pair.manager} · без мастера`;
    return `${pair.manager} + ${pair.master}`;
  }

  function renderDesktopCalendarDetail(dateStr){
    const root=$("desktopCalendarDetail");
    if(!root) return;

    const [y,m,d]=dateStr.split("-").map(Number);
    const date=new Date(y,m-1,d);
    const title=new Intl.DateTimeFormat("ru-RU",{
      weekday:"long",day:"numeric",month:"long",year:"numeric"
    }).format(date);

    const services=desktopCalendarServices();
    if(!services.length){
      root.innerHTML=`<div class="notice">Сервис не определён.</div>`;
      return;
    }

    root.innerHTML=`
      <div style="font-weight:900;color:#24344d;margin:2px 0 1px">${escapeHtml(title)}</div>
      ${services.map(service=>{
        const pair=expectedForDate(dateStr,service);
        const key=serviceKeyForName(service);
        return `<div class="desktop-calendar-detail-card ${key?`service-${key}`:""}">
          <b>${escapeHtml(service)}</b>
          <span>${escapeHtml(calendarPairText(pair))}<br>${escapeHtml(settings.shiftStart)}–${escapeHtml(settings.shiftEnd)}</span>
        </div>`;
      }).join("")}
    `;
  }

  function renderDesktopCalendar(){
    if(isEmployeePhoneMode()) return;

    let info=monthInfo(desktopCalendarIndex);
    if(info.year<2020 || info.year>2100){
      desktopCalendarIndex=getCurrentMonthIndex();
      info=monthInfo(desktopCalendarIndex);
    }

    $("desktopCalLabel").textContent=`${info.name} ${info.year}`;
    $("desktopLegendS1").textContent=settings.service1;
    $("desktopLegendS2").textContent=settings.service2;
    $("desktopCalPrev").disabled=info.year<=2020 && info.month===0;
    $("desktopCalNext").disabled=info.year>=2100 && info.month===11;
    $("desktopCalendarModeLabel").textContent=isServiceDeviceMode()
      ? `Календарь точки: ${serviceDeviceName()}`
      : "Общий календарь двух сервисов";

    const firstDow=(new Date(info.year,info.month,1).getDay()+6)%7;
    const today=moscowParts().date;
    const services=desktopCalendarServices();
    const cells=[];

    for(let i=0;i<firstDow;i++){
      cells.push('<div class="desktop-cal-cell blank"></div>');
    }

    for(let day=1;day<=info.days;day++){
      const dateStr=`${info.year}-${String(info.month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const todayClass=dateStr===today?" today":"";
      const selectedClass=dateStr===desktopCalendarSelectedDate?" selected":"";

      const chips=services.map(service=>{
        const pair=expectedForDate(dateStr,service);
        const key=serviceKeyForName(service);
        return `<span class="desktop-service-chip ${key?`service-${key}`:""}">
          <strong>${escapeHtml(service)}</strong>
          <small>${escapeHtml(calendarPairText(pair))}</small>
        </span>`;
      }).join("");

      cells.push(`<button class="desktop-cal-cell${todayClass}${selectedClass}" data-desktop-date="${dateStr}">
        <div class="desktop-cal-day">${day}</div>
        <div class="desktop-cal-services">${chips}</div>
      </button>`);
    }

    $("desktopCalendarGrid").innerHTML=cells.join("");
    $("desktopCalendarGrid").querySelectorAll("[data-desktop-date]").forEach(btn=>{
      btn.onclick=()=>{
        desktopCalendarSelectedDate=btn.dataset.desktopDate;
        renderDesktopCalendar();
      };
    });

    const selectedPrefix=`${info.year}-${String(info.month+1).padStart(2,"0")}-`;
    if(!desktopCalendarSelectedDate || !desktopCalendarSelectedDate.startsWith(selectedPrefix)){
      desktopCalendarSelectedDate=`${info.year}-${String(info.month+1).padStart(2,"0")}-01`;
    }
    renderDesktopCalendarDetail(desktopCalendarSelectedDate);
  }

  function renderEmployeeIdentity(){
    const name=selectedEmployee();
    if($("employeeIdentityName")) $("employeeIdentityName").textContent=name||"Не выбран";
  }

  function renderEmployeePages(){
    if(!isEmployeePhoneMode()) return;
    renderEmployeeIdentity();

    if(employeeMobileView==="employeeMy"){
      renderEmployeeMySchedule();
      updateEmployeeReminderState();
      return;
    }

    if(employeeMobileView==="employeeCalendar"){
      renderEmployeeCalendar();
      return;
    }

    renderEmployeeToday();
  }

  function renderSelectors(){
    const info=monthInfo(currentIndex);

    monthSelect.innerHTML=MONTHS.map((m,i)=>`<option value="${i}">${m} ${info.year}</option>`).join("");
    monthSelect.value=String(info.month);

    yearSelect.innerHTML="";
    for(let y=2020;y<=2100;y++){
      const o=document.createElement("option");
      o.value=String(y);
      o.textContent=String(y);
      yearSelect.appendChild(o);
    }
    yearSelect.value=String(info.year);

    $("prevBtn").disabled=info.year<=2020 && info.month===0;
    $("nextBtn").disabled=info.year>=2100 && info.month===11;
    $("todayMonthBtn").textContent="Сегодня";

    const names=employeeNamesInMonth(currentIndex);
    const hasUnassigned=monthHasUnassigned(currentIndex);
    const prev=employeeFilter.value;

    employeeFilter.innerHTML='<option value="">Все сотрудники</option>';

    if(hasUnassigned){
      const o=document.createElement("option");
      o.value="__unassigned__";
      o.textContent="Не назначен";
      employeeFilter.appendChild(o);
    }

    names.forEach(n=>{
      const o=document.createElement("option");
      o.value=n;
      o.textContent=n;
      employeeFilter.appendChild(o);
    });

    if(prev==="__unassigned__" && hasUnassigned){
      employeeFilter.value=prev;
    }else{
      employeeFilter.value=names.includes(prev)?prev:"";
    }
  }

  function serviceScheduleDateKey(date){
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function serviceScheduleIndexForDate(dateStr){
    const [y,m]=dateStr.split("-").map(Number);
    return monthIndexForYearMonth(y,m-1);
  }

  function jumpServiceScheduleToDate(dateStr){
    if(!isServiceDeviceMode()) return;
    const idx=serviceScheduleIndexForDate(dateStr);
    const mi=monthInfo(idx);
    if(mi.year<2020 || mi.year>2100){
      toast("Можно выбрать год от 2020 до 2100");
      return;
    }
    serviceScheduleSelectedDate=dateStr;
    currentIndex=idx;
    userSelectedMonth=true;
    renderMonth();
    requestAnimationFrame(()=>{
      const row=document.querySelector(`[data-service-date="${dateStr}"]`);
      if(row) row.scrollIntoView({behavior:"smooth",block:"center"});
    });
  }

  function openServiceDayDetail(dateStr){
    if(!isServiceDeviceMode()) return;
    const service=serviceDeviceName();
    const idx=serviceScheduleIndexForDate(dateStr);
    const info=monthInfo(idx);
    const day=Number(dateStr.slice(-2));

    const rows=buildMonthRows(idx);
    const row=rows.find(r=>r.date.getDate()===day);
    if(!row) return;

    const key=service===settings.service1 ? "s1" : "s2";
    const pair=row[key];
    const date=new Date(info.year,info.month,day);
    const title=new Intl.DateTimeFormat("ru-RU",{
      weekday:"long",day:"numeric",month:"long",year:"numeric"
    }).format(date);

    let statusHtml="";
    if(dateStr===moscowParts().date){
      const shift=currentShiftRows.find(x=>x.service===service)||null;
      if(shift?.closed_at){
        statusHtml=`<div class="service-day-status ok">Смена закрыта в ${formatMoscowTime(shift.closed_at)} · ${escapeHtml(shift.closed_by||"—")}</div>`;
      }else if(shift?.opened_at){
        const cls=(shift.open_late_minutes||0)>0?"warn":"ok";
        const late=(shift.open_late_minutes||0)>0?` · опоздание ${shift.open_late_minutes} мин`:"";
        statusHtml=`<div class="service-day-status ${cls}">Смена открыта в ${formatMoscowTime(shift.opened_at)} · ${escapeHtml(shift.opened_by||"—")}${late}</div>`;
      }else{
        statusHtml='<div class="service-day-status bad">Смена сегодня ещё не открыта.</div>';
      }
    }else{
      statusHtml='<div class="service-day-status ok">Плановая смена</div>';
    }

    $("serviceDayTitle").textContent=title;
    $("serviceDayDetail").innerHTML=`
      <div class="service-day-detail-row"><small>Менеджер</small><b>${escapeHtml(pair.manager)}</b></div>
      <div class="service-day-detail-row"><small>Мастер</small><b>${escapeHtml(pair.master)}</b></div>
      <div class="service-day-detail-row"><small>Время</small><b>${settings.shiftStart}–${settings.shiftEnd}</b></div>
      ${statusHtml}
    `;
    $("serviceDayModal").classList.remove("hidden");
  }

  function renderServicePointSchedule(rows){
    const service=serviceDeviceName();
    const key=service===settings.service1 ? "s1" : "s2";
    const today=moscowParts().date;
    const tomorrow=addDaysISO(today,1);
    const selected=serviceScheduleSelectedDate || today;

    const wrap=document.createElement("section");
    const serviceKey=serviceKeyForName(service);
    wrap.className=`service-point-schedule ${serviceKey?`service-${serviceKey}`:""}`.trim();
    wrap.innerHTML=`
      <div class="service-point-head">
        <div>
          <h2>График ${escapeHtml(service)}</h2>
          <span>Нажмите на день, чтобы посмотреть детали</span>
        </div>
      </div>
      <div class="service-quick-nav">
        <button type="button" id="serviceJumpToday" class="${selected===today?"active":""}">Сегодня</button>
        <button type="button" id="serviceJumpTomorrow" class="${selected===tomorrow?"active":""}">Завтра</button>
        <input type="date" id="serviceJumpDate" min="2020-01-01" max="2100-12-31" value="${selected}" aria-label="Выбрать дату">
      </div>
      <div class="service-schedule-scroll" id="serviceScheduleScroll"></div>
    `;

    const list=wrap.querySelector("#serviceScheduleScroll");
    list.innerHTML=rows.map(r=>{
      const pair=r[key];
      const dateKey=serviceScheduleDateKey(r.date);
      const isToday=dateKey===today;
      const isSelected=dateKey===selected;
      const solo=isNoManagerValue(pair.manager);
      return `<button type="button" class="service-day-row ${isToday?"today":""} ${isSelected?"selected":""}" data-service-date="${dateKey}">
        <div class="service-day-date">
          <b>${r.date.getDate()}${isToday?'<span class="service-today-tag">Сегодня</span>':""}</b>
          <span>${WD[r.date.getDay()]}</span>
        </div>
        <div class="service-day-pair">
          <b>${solo?`Только ${escapeHtml(pair.master)}`:`${escapeHtml(pair.manager)} + ${escapeHtml(pair.master)}`}</b>
          <span>${solo?"Только мастер":"Менеджер + мастер"}</span>
        </div>
      </button>`;
    }).join("");

    const dateInput=wrap.querySelector("#serviceJumpDate");
    wrap.querySelector("#serviceJumpToday").onclick=()=>{
      dateInput.value=today;
      jumpServiceScheduleToDate(today);
    };
    wrap.querySelector("#serviceJumpTomorrow").onclick=()=>{
      dateInput.value=tomorrow;
      jumpServiceScheduleToDate(tomorrow);
    };
    dateInput.onchange=e=>{
      if(e.target.value) jumpServiceScheduleToDate(e.target.value);
    };
    list.querySelectorAll("[data-service-date]").forEach(btn=>{
      btn.onclick=()=>openServiceDayDetail(btn.dataset.serviceDate);
    });

    requestAnimationFrame(()=>{
      const todayRow=list.querySelector(`[data-service-date="${today}"]`);
      if(todayRow && currentIndex===getCurrentMonthIndex()){
        todayRow.scrollIntoView({behavior:"auto",block:"center"});
      }
    });

    return wrap;
  }

  function scheduleHasDayOverride(dateStr,serviceName){
    const serviceKey=serviceKeyForName(serviceName);
    return (settings.dayOverrides||[]).some(o=>{
      if(o.date!==dateStr) return false;
      const key=o.serviceKey || serviceKeyForName(o.service);
      return key===serviceKey || o.service===serviceName;
    });
  }

  function scheduleCellHasProblem(pair){
    if(!pair) return true;
    const managerBad=!isNoManagerValue(pair.manager) && scheduleValueCount(pair.manager)!==1;
    const masterBad=!isNoMasterValue(pair.master) && scheduleValueCount(pair.master)!==1;
    return managerBad || masterBad;
  }

  function unifiedPairHtml(pair){
    if(!pair) return '<div class="unified-pair">Не назначено</div>';
    if(isNoManagerValue(pair.manager) && isNoMasterValue(pair.master)){
      return '<div class="unified-pair">Без сотрудников</div>';
    }
    if(isNoManagerValue(pair.manager)){
      return `<div class="unified-pair">Только <b>${escapeHtml(pair.master)}</b></div>`;
    }
    if(isNoMasterValue(pair.master)){
      return `<div class="unified-pair"><b>${escapeHtml(pair.manager)}</b> <span>· без мастера</span></div>`;
    }
    return `<div class="unified-pair"><b>${escapeHtml(pair.manager)}</b> <span>+ ${escapeHtml(pair.master)}</span></div>`;
  }

  function renderUnifiedSchedule(rows){
    const today=moscowParts().date;
    const card=document.createElement("section");
    card.className="unified-schedule-card";

    const adminCanEdit=isAdmin() && !isServiceDeviceMode();
    card.innerHTML=`
      <div class="unified-schedule-head">
        <div class="unified-schedule-legend">
          <span class="unified-legend-item service-s1">● ${escapeHtml(settings.service1)}</span>
          <span class="unified-legend-item service-s2">● ${escapeHtml(settings.service2)}</span>
        </div>
        <div class="unified-schedule-hint">${adminCanEdit?"Нажмите на смену, чтобы изменить":"Весь месяц в одной таблице"}</div>
      </div>
      <div class="unified-schedule-scroll">
        <table class="unified-schedule-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th class="service-s1">${escapeHtml(settings.service1)}</th>
              <th class="service-s2">${escapeHtml(settings.service2)}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    const tbody=card.querySelector("tbody");

    rows.forEach(r=>{
      const dateStr=dateKeyFromDate(r.date);
      const isToday=dateStr===today;
      const weekend=r.date.getDay()===0 || r.date.getDay()===6;

      const tr=document.createElement("tr");
      tr.className=`unified-schedule-row${isToday?" today":""}${weekend?" weekend":""}`;

      const dateTd=document.createElement("td");
      dateTd.className="unified-date-cell";
      dateTd.innerHTML=`${r.date.getDate()} ${WD[r.date.getDay()]}${isToday?'<small>Сегодня</small>':""}`;
      tr.appendChild(dateTd);

      [
        {key:"s1",service:settings.service1,pair:r.s1},
        {key:"s2",service:settings.service2,pair:r.s2}
      ].forEach(item=>{
        const td=document.createElement("td");
        const btn=document.createElement("button");
        const changed=scheduleHasDayOverride(dateStr,item.service);
        const problem=scheduleCellHasProblem(item.pair);

        btn.type="button";
        btn.className=`unified-shift-cell service-${item.key}${adminCanEdit?" manageable":""}${problem?" has-problem":""}`;
        btn.dataset.manager=item.pair?.manager||"";
        btn.dataset.master=item.pair?.master||"";
        btn.dataset.scheduleDate=dateStr;
        btn.dataset.scheduleService=item.service;
        btn.innerHTML=`
          <div class="unified-service-name">${escapeHtml(item.service)}</div>
          ${unifiedPairHtml(item.pair)}
          ${changed?'<span class="schedule-change-tag">Замена</span>':""}
        `;

        if(adminCanEdit){
          btn.onclick=()=>openScheduleManage(dateStr,item.service);
          btn.title="Нажмите, чтобы изменить смену";
        }

        td.appendChild(btn);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    return card;
  }

  function renderMonth(){
    renderSelectors();
    const info=monthInfo(currentIndex);
    const inPlan=info.year>=2020 && info.year<=2100;
    $("monthTitle").textContent=`${info.name} ${info.year}`;

    const root=$("servicesRoot");
    root.innerHTML="";

    if(inPlan){
      const rows=buildMonthRows(currentIndex);
      if(isServiceDeviceMode()){
        $("monthSubtitle").textContent="";
        root.appendChild(renderServicePointSchedule(rows));
        $("monthActions").classList.add("hidden");
        $("monthPhotoNotice").classList.add("hidden");
      }else{
        $("monthSubtitle").textContent="";
        root.appendChild(renderUnifiedSchedule(rows));
        $("monthActions").classList.remove("hidden");
        $("monthPhotoNotice").classList.add("hidden");
        highlightEmployee();
      }
    }else{
      const current = currentIndex===getCurrentMonthIndex();
      $("monthSubtitle").textContent="Выбери год от 2020 до 2100";
      root.innerHTML=isServiceDeviceMode()
        ? `<div class="outside-plan">
            ${current ? '<div class="current-badge">ТЕКУЩИЙ МЕСЯЦ</div>' : ''}
            <h3>${escapeHtml(info.name)} ${info.year}</h3>
            <p>На этот месяц график точки ещё не задан.</p>
            <p><b>График начинается с ${escapeHtml(monthInfo(0).name)} ${monthInfo(0).year}.</b></p>
          </div>`
        : `<div class="outside-plan">
            ${current ? '<div class="current-badge">ТЕКУЩИЙ МЕСЯЦ</div>' : ''}
            <h3>${escapeHtml(info.name)} ${info.year}</h3>
            <p>Этот месяц не входит в годовой график.</p>
            <p><b>Годовой график начинается с ${escapeHtml(monthInfo(0).name)} ${monthInfo(0).year}.</b></p>
            <p>Блок <b>«Сегодня»</b> выше продолжает работать: смену можно открыть, закрыть и посмотреть её состояние.</p>
          </div>`;
      $("monthActions").classList.add("hidden");
      $("monthPhotoNotice").classList.add("hidden");
    }

    renderScheduleAdminTools();
    renderMonthlyWorkload();
    if(!$("adminTodayPage").classList.contains("hidden")) renderTodayShifts();
  }


  function scheduleValueNames(value){
    const raw=String(value||"").trim();
    if(!raw || raw==="Не назначен" || isNoManagerValue(raw) || isNoMasterValue(raw)) return [];
    if(raw.startsWith("Конфликт:")){
      return raw.replace(/^Конфликт:\s*/,"").split(",").map(x=>x.trim()).filter(Boolean);
    }
    return [raw];
  }

  function scheduleValueCount(value){
    return scheduleValueNames(value).length;
  }

  function monthlyWorkloadData(monthIndex){
    const rows=buildMonthRows(monthIndex);
    const map=new Map();

    function add(role,name,service){
      if(!name || name==="Не назначен" || isNoManagerValue(name) || isNoMasterValue(name)) return;
      const key=`${role}|${name}`;
      if(!map.has(key)){
        map.set(key,{
          role,
          name,
          total:0,
          s1:0,
          s2:0
        });
      }
      const item=map.get(key);
      item.total+=1;
      if(service===settings.service1) item.s1+=1;
      if(service===settings.service2) item.s2+=1;
    }

    rows.forEach(r=>{
      scheduleValueNames(r.s1.manager).forEach(name=>add("manager",name,settings.service1));
      scheduleValueNames(r.s1.master).forEach(name=>add("master",name,settings.service1));
      scheduleValueNames(r.s2.manager).forEach(name=>add("manager",name,settings.service2));
      scheduleValueNames(r.s2.master).forEach(name=>add("master",name,settings.service2));
    });

    const knownOrder=new Map();
    (settings.employeeSchedules||[]).forEach((emp,index)=>{
      const role=emp.role==="master"?"master":"manager";
      knownOrder.set(`${role}|${emp.name}`,index);
    });

    return [...map.values()].sort((a,b)=>{
      const roleA=a.role==="manager"?0:1;
      const roleB=b.role==="manager"?0:1;
      if(roleA!==roleB) return roleA-roleB;

      const ai=knownOrder.has(`${a.role}|${a.name}`)?knownOrder.get(`${a.role}|${a.name}`):9999;
      const bi=knownOrder.has(`${b.role}|${b.name}`)?knownOrder.get(`${b.role}|${b.name}`):9999;
      if(ai!==bi) return ai-bi;
      return a.name.localeCompare(b.name,"ru");
    });
  }

  function renderMonthlyWorkload(){
    const card=$("scheduleWorkloadCard");
    const root=$("scheduleWorkloadTable");
    const label=$("scheduleWorkloadLabel");
    if(!card || !root || !label) return;

    const show=isAdmin() && !isServiceDeviceMode() && !isEmployeePhoneMode();
    card.classList.toggle("hidden",!show);
    if(!show) return;

    const info=monthInfo(currentIndex);
    const data=monthlyWorkloadData(currentIndex);
    label.textContent=`${info.name} ${info.year}`;

    if(!data.length){
      root.innerHTML=`<div class="notice">На этот месяц нет назначенных смен.</div>`;
      return;
    }

    root.innerHTML=`
      <table class="workload-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Всего смен</th>
            <th>${escapeHtml(settings.service1)}</th>
            <th>${escapeHtml(settings.service2)}</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(item=>`
            <tr>
              <td>
                <span class="employee-name">${escapeHtml(item.name)}</span>
                <span class="employee-role">${item.role==="manager"?"Менеджер":"Мастер"}</span>
              </td>
              <td class="total-shifts">${item.total}</td>
              <td>${item.s1}</td>
              <td>${item.s2}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  }

  function monthScheduleProblems(monthIndex){
    const rows=buildMonthRows(monthIndex);
    const problems=[];

    rows.forEach(r=>{
      const date=dateKeyFromDate(r.date);
      for(const item of [
        {service:settings.service1,role:"manager",label:"менеджер",value:r.s1.manager},
        {service:settings.service1,role:"master",label:"мастер",value:r.s1.master},
        {service:settings.service2,role:"manager",label:"менеджер",value:r.s2.manager},
        {service:settings.service2,role:"master",label:"мастер",value:r.s2.master}
      ]){
        if(item.role==="manager" && isNoManagerValue(item.value)) continue;
        if(item.role==="master" && isNoMasterValue(item.value)) continue;
        const count=scheduleValueCount(item.value);
        if(count!==1) problems.push({...item,date,count,names:scheduleValueNames(item.value)});
      }
    });

    return problems;
  }

  function scheduleProblemsInRange(fromDate,days=60){
    const problems=[];
    const start=dateObjectFromKey(fromDate);

    for(let i=0;i<days;i++){
      const date=new Date(start);
      date.setDate(start.getDate()+i);
      const dateKey=dateKeyFromDate(date);
      const idx=monthIndexForYearMonth(date.getFullYear(),date.getMonth());
      const row=daySchedule(idx,date.getDate());

      for(const item of [
        {service:settings.service1,role:"manager",label:"менеджер",value:row.s1.manager},
        {service:settings.service1,role:"master",label:"мастер",value:row.s1.master},
        {service:settings.service2,role:"manager",label:"менеджер",value:row.s2.manager},
        {service:settings.service2,role:"master",label:"мастер",value:row.s2.master}
      ]){
        if(item.role==="manager" && isNoManagerValue(item.value)) continue;
        if(item.role==="master" && isNoMasterValue(item.value)) continue;
        const count=scheduleValueCount(item.value);
        if(count!==1){
          problems.push({...item,date:dateKey,count,names:scheduleValueNames(item.value)});
        }
      }
    }
    return problems;
  }

  function problemPositionKey(p){
    return `${p.date}|${serviceKeyForName(p.service)||p.service}|${p.role}|${p.count}`;
  }

  function problemsForTemporarySettings(tempSettings,fromDate,days=60){
    const real=settings;
    try{
      settings=normalizeScheduleSettings(tempSettings);
      return scheduleProblemsInRange(fromDate,days);
    }finally{
      settings=real;
    }
  }

  function renderScheduleAdminTools(){
    const tools=$("scheduleAdminTools");
    const summary=$("scheduleProblemSummary");
    const details=$("scheduleProblemDetails");
    const addBtn=$("addEmployeeBtn");
    if(!tools || !summary || !details) return;

    const adminView=isAdmin() && !isServiceDeviceMode() && !isEmployeePhoneMode();
    if(addBtn) addBtn.classList.toggle("hidden",!adminView);

    if(!adminView){
      tools.classList.add("hidden");
      return;
    }

    const problems=monthScheduleProblems(currentIndex);

    // Если график нормальный — не занимаем место сообщением «всё хорошо».
    if(!problems.length){
      tools.classList.add("hidden");
      summary.innerHTML="";
      details.innerHTML="";
      details.classList.add("hidden");
      return;
    }

    tools.classList.remove("hidden");

    const affected=new Set(problems.map(p=>`${p.date}|${p.service}`)).size;
    const missing=problems.filter(p=>p.count===0).length;
    const overlaps=problems.filter(p=>p.count>1).length;
    const parts=[];
    if(missing) parts.push(`не назначено: ${missing}`);
    if(overlaps) parts.push(`пересечения: ${overlaps}`);

    summary.innerHTML=`
      <div class="schedule-problem-card">
        <div>
          <b>⚠ ${affected} ${affected===1?"проблема":"проблемы"} в графике</b>
          <span>${parts.join(" · ")}</span>
        </div>
        <button class="secondary schedule-problem-toggle" id="scheduleProblemToggle" type="button">Посмотреть</button>
      </div>`;

    details.innerHTML=problems.map(p=>{
      const problemText=p.count===0 ? `нет ${p.label}а` : `${p.count} сотрудника одновременно`;
      return `
        <div class="schedule-problem-row">
          <div>
            <b>${escapeHtml(russianDateLong(p.date))} · ${escapeHtml(p.service)}</b>
            <span>${escapeHtml(problemText)}</span>
          </div>
          <button class="secondary schedule-problem-fix" type="button"
            data-fix-date="${escapeHtml(p.date)}"
            data-fix-service="${escapeHtml(p.service)}">Исправить</button>
        </div>`;
    }).join("");

    details.classList.add("hidden");

    const toggle=$("scheduleProblemToggle");
    if(toggle){
      toggle.onclick=()=>{
        const willShow=details.classList.contains("hidden");
        details.classList.toggle("hidden");
        toggle.textContent=willShow?"Скрыть":"Посмотреть";
      };
    }

    details.querySelectorAll("[data-fix-date]").forEach(btn=>{
      btn.onclick=()=>openScheduleManage(btn.dataset.fixDate,btn.dataset.fixService);
    });
  }

  function currentPairForDate(dateStr,service){
    const [y,m,d]=dateStr.split("-").map(Number);
    const idx=monthIndexForYearMonth(y,m-1);
    const row=daySchedule(idx,d);
    return service===settings.service1 ? row.s1 : row.s2;
  }

  function employeeRecordByVisibleName(name,dateStr=moscowParts().date){
    const visible=employeesForDate(dateObjectFromKey(dateStr)).find(x=>x.name===name);
    if(visible){
      return (settings.employeeSchedules||[]).find(x=>String(x.id)===String(visible.id))||null;
    }
    return (settings.employeeSchedules||[]).find(x=>x.name===name)||null;
  }

  function openEmployeeEditorByName(name,dateStr=moscowParts().date){
    const emp=employeeRecordByVisibleName(name,dateStr);
    if(!emp){
      toast("Для этого сотрудника нет карточки графика");
      return;
    }
    $("scheduleManageModal").classList.add("hidden");
    openEmployeeScheduleEditor(emp.id,dateStr,name);
  }

  function openQuickReplaceFor(date,service,role){
    if(!isAdmin()){ openLoginModal(); return; }

    quickReplaceFixedContext=true;
    $("quickReplaceTitle").textContent="Замена на один день";
    $("quickReplaceContextFields").classList.add("hidden");

    $("quickReplaceDate").value=date;
    $("quickReplaceService").innerHTML=`
      <option value="${escapeHtml(settings.service1)}">${escapeHtml(settings.service1)}</option>
      <option value="${escapeHtml(settings.service2)}">${escapeHtml(settings.service2)}</option>`;
    $("quickReplaceService").value=service;
    $("quickReplaceRole").innerHTML='<option value="manager">Менеджер</option><option value="master">Мастер</option>';
    $("quickReplaceRole").value=role;

    refreshQuickReplaceForm();
    $("scheduleManageModal").classList.add("hidden");
    $("quickReplaceModal").classList.remove("hidden");
  }

  async function markEmployeeLeftDirect(name,date){
    if(!isAdmin()){ openLoginModal(); return; }
    if(!name || name==="Не назначен" || name.startsWith("Конфликт:")) return;

    const ok=confirm(`${name} больше не работает с ${date}? Прошлые дни останутся без изменений.`);
    if(!ok) return;

    const previous=clone(settings);
    try{
      settings.staffChanges=settings.staffChanges||[];

      const already=settings.staffChanges.some(x=>
        x.type==="left" &&
        x.oldName===name &&
        x.date<=date
      );
      if(already){
        toast("Этот сотрудник уже отмечен как ушедший");
        return;
      }

      settings.staffChanges.push({
        id:`left-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date,
        oldName:name,
        newName:"",
        type:"left"
      });
      settings.staffChanges.sort((a,b)=>a.date.localeCompare(b.date));
      settings=normalizeScheduleSettings(settings);
      saveSettings();
      if(cloudConfigured()) await saveToCloud(settings);
      settingsDirty=false;
      lastSettingsSignature=stableJson(settings);

      $("scheduleManageModal").classList.add("hidden");
      renderMonth();
      renderPinFields();
      fillHistoryFilters();
      if(isEmployeePhoneMode()) renderEmployeePages();
      toast(`${name}: больше не работает с ${date}`);
    }catch(e){
      console.error(e);
      settings=previous;
      saveSettings();
      renderMonth();
      toast(e.message||"Не удалось изменить сотрудника");
    }
  }

  function manageRoleHtml(role,label,value,date,service){
    if(role==="manager" && isNoManagerValue(value)){
      return `
        <div class="schedule-manage-role">
          <div><small>${escapeHtml(label)} · сб/вс</small><b>Без менеджера</b></div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">В Нове по субботам и воскресеньям работают только Георгий или Асик.</div>
        </div>`;
    }

    if(role==="master" && isNoMasterValue(value)){
      return `
        <div class="schedule-manage-role">
          <div><small>${escapeHtml(label)} · временно</small><b>Без мастера</b></div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">Плановый день без мастера на период отпуска Олега.</div>
        </div>`;
    }

    const names=scheduleValueNames(value);
    const count=names.length;

    if(count===0){
      const ending=role==="manager"?"менеджера":"мастера";
      return `
        <div class="schedule-manage-role problem">
          <div><small>${escapeHtml(label)}</small><b>Не назначен</b></div>
          <div class="schedule-manage-actions">
            <button class="primary" type="button"
              data-manage-assign="${role}"
              data-manage-date="${escapeHtml(date)}"
              data-manage-service="${escapeHtml(service)}">Назначить ${ending}</button>
          </div>
        </div>`;
    }

    if(count>1){
      const balanced=isBalancedRosterRole(role,dateObjectFromKey(date));
      return `
        <div class="schedule-manage-role problem">
          <div><small>${escapeHtml(label)}${balanced?" · авто":""}</small><b>Одновременно ${count}</b></div>
          <div class="schedule-manage-conflict">
            ${names.map(n=>`
              <div class="schedule-manage-conflict-row">
                <span>${escapeHtml(n)}</span>
                ${balanced?"":`<button class="secondary" type="button" data-manage-edit-name="${escapeHtml(n)}" data-manage-edit-date="${escapeHtml(date)}">Изменить график</button>`}
              </div>`).join("")}
          </div>
        </div>`;
    }

    const name=names[0];
    const hasCard=!!employeeRecordByVisibleName(name,date);
    const balanced=isBalancedRosterRole(role,dateObjectFromKey(date));
    return `
      <div class="schedule-manage-role">
        <div><small>${escapeHtml(label)}${balanced?" · авто":""}</small><b>${escapeHtml(name)}</b></div>
        <div class="schedule-manage-actions">
          <button class="secondary" type="button"
            data-manage-replace="${role}"
            data-manage-date="${escapeHtml(date)}"
            data-manage-service="${escapeHtml(service)}">Замена</button>
          ${hasCard && !balanced?`<button class="secondary" type="button" data-manage-edit-name="${escapeHtml(name)}" data-manage-edit-date="${escapeHtml(date)}">Изменить график</button>`:""}
          <button class="danger" type="button"
            data-manage-left-name="${escapeHtml(name)}"
            data-manage-left-date="${escapeHtml(date)}">Больше не работает</button>
        </div>
      </div>`;
  }

  function openScheduleManage(date,service){
    if(!isAdmin()){ openLoginModal(); return; }

    const pair=currentPairForDate(date,service);
    if(!pair) return;

    $("scheduleManageTitle").textContent=`${service} · ${russianDateLong(date)}`;
    $("scheduleManageSubtitle").textContent="Нужна разовая подмена — нажмите «Замена» возле сотрудника.";
    $("scheduleManageBody").innerHTML=
      manageRoleHtml("manager","Менеджер",pair.manager,date,service)+
      manageRoleHtml("master","Мастер",pair.master,date,service);

    $("scheduleManageBody").querySelectorAll("[data-manage-assign]").forEach(btn=>{
      btn.onclick=()=>openQuickReplaceFor(btn.dataset.manageDate,btn.dataset.manageService,btn.dataset.manageAssign);
    });

    $("scheduleManageBody").querySelectorAll("[data-manage-replace]").forEach(btn=>{
      btn.onclick=()=>openQuickReplaceFor(btn.dataset.manageDate,btn.dataset.manageService,btn.dataset.manageReplace);
    });

    $("scheduleManageBody").querySelectorAll("[data-manage-edit-name]").forEach(btn=>{
      btn.onclick=()=>openEmployeeEditorByName(btn.dataset.manageEditName,btn.dataset.manageEditDate);
    });

    $("scheduleManageBody").querySelectorAll("[data-manage-left-name]").forEach(btn=>{
      btn.onclick=()=>markEmployeeLeftDirect(btn.dataset.manageLeftName,btn.dataset.manageLeftDate);
    });

    $("scheduleManageModal").classList.remove("hidden");
  }

  function serviceCard(title,key,rows){
    const card=document.createElement("section"); card.className="service-card";
    const head=document.createElement("div"); head.className="service-head";
    const ruleText=title===settings.service2
      ? "Мастер Новы = ответственный за смену"
      : "Арсен/Дина 2/2 · только Моба";
    head.innerHTML=`<h2>${escapeHtml(title)}</h2><div class="small">${ruleText}</div>`;
    card.appendChild(head);

    const halves=document.createElement("div"); halves.className="halves";
    const first=rows.filter(r=>r.date.getDate()<=15);
    const second=rows.filter(r=>r.date.getDate()>=16);
    halves.appendChild(halfTable("1–15 число",key,first,title));
    halves.appendChild(halfTable(`16–${rows.length} число`,key,second,title));
    card.appendChild(halves);
    return card;
  }

  function halfTable(label,key,rows,serviceName){
    const wrap=document.createElement("div"); wrap.className="half";
    const h=document.createElement("h3"); h.textContent=label; wrap.appendChild(h);
    const t=document.createElement("table"); t.className="schedule";
    t.innerHTML="<thead><tr><th>Дата / день</th><th>Менеджер + мастер</th></tr></thead>";
    const tb=document.createElement("tbody");
    rows.forEach(r=>{
      const d=r.date.getDate(), pair=r[key];
      const tr=document.createElement("tr");
      const dateKey=dateKeyFromDate(r.date);
      tr.dataset.manager=pair.manager;
      tr.dataset.master=pair.master;
      tr.dataset.scheduleDate=dateKey;
      tr.dataset.scheduleService=serviceName;

      if((!isNoManagerValue(pair.manager) && scheduleValueCount(pair.manager)!==1) || (!isNoMasterValue(pair.master) && scheduleValueCount(pair.master)!==1)){
        tr.classList.add("has-problem");
      }

      if(isAdmin() && !isServiceDeviceMode()){
        tr.classList.add("manageable");
        tr.title="Нажмите, чтобы изменить смену";
        tr.onclick=()=>openScheduleManage(dateKey,serviceName);
      }

      const today=new Date();
      if(today.getFullYear()===r.date.getFullYear() && today.getMonth()===r.date.getMonth() && today.getDate()===d) tr.classList.add("today");
      const pairLabel=isNoManagerValue(pair.manager)
        ? `Только мастер: ${escapeHtml(pair.master)}`
        : (isNoMasterValue(pair.master)
          ? `${escapeHtml(pair.manager)} · без мастера`
          : `${escapeHtml(pair.manager)} + ${escapeHtml(pair.master)}`);
      tr.innerHTML=`<td class="date">${d} ${WD[r.date.getDay()]}</td><td class="pair">${pairLabel}</td>`;
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  }

  function highlightEmployee(){
    const name=employeeFilter.value;

    document.querySelectorAll(".unified-shift-cell").forEach(cell=>{
      const match=name==="__unassigned__"
        ? (cell.dataset.manager==="Не назначен" || cell.dataset.master==="Не назначен")
        : (!!name && (cell.dataset.manager===name || cell.dataset.master===name));
      cell.classList.toggle("highlight",match);
    });

    // Совместимость со старым/служебным представлением графика.
    document.querySelectorAll(".schedule tbody tr").forEach(tr=>{
      const match=name==="__unassigned__"
        ? (tr.dataset.manager==="Не назначен" || tr.dataset.master==="Не назначен")
        : (!!name && (tr.dataset.manager===name || tr.dataset.master===name));
      tr.classList.toggle("highlight",match);
    });
  }


  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }


  function roleLabel(role){ return role==="master" ? "Мастер" : "Менеджер"; }

  function presetForCycle(work,off){
    const key=`${Number(work)}/${Number(off)}`;
    return ["2/2","3/3","5/2","6/1","7/7"].includes(key)?key:"custom";
  }


  function closeAddEmployeeModal(){
    $("addEmployeeModal").classList.add("hidden");
  }

  function updateNewEmployeeCustomFields(){
    const custom=$("newEmployeePreset").value==="custom";
    $("newEmployeeWorkDays").closest(".field").classList.toggle("hidden",!custom);
    $("newEmployeeOffDays").closest(".field").classList.toggle("hidden",!custom);
  }

  function applyNewEmployeePreset(){
    const value=$("newEmployeePreset").value;
    if(value!=="custom"){
      const [work,off]=value.split("/").map(Number);
      $("newEmployeeWorkDays").value=work;
      $("newEmployeeOffDays").value=off;
    }
    updateNewEmployeeCustomFields();
  }

  function syncNewEmployeePreset(){
    $("newEmployeePreset").value=presetForCycle(
      $("newEmployeeWorkDays").value,
      $("newEmployeeOffDays").value
    );
    updateNewEmployeeCustomFields();
  }

  function setEmployeeScheduleChange(employee,fromDate,workDays,offDays){
    employee.scheduleChanges=Array.isArray(employee.scheduleChanges)?employee.scheduleChanges:[];
    employee.scheduleChanges=employee.scheduleChanges.filter(c=>c.from<fromDate);
    employee.scheduleChanges.push({
      from:fromDate,
      workDays:Math.max(1,Math.min(14,Number(workDays)||2)),
      offDays:Math.max(1,Math.min(14,Number(offDays)||2)),
      cycleStart:fromDate
    });
    employee.scheduleChanges.sort((a,b)=>a.from.localeCompare(b.from));
  }

  function newlyCreatedProblems(tempSettings,fromDate,days=60){
    const before=scheduleProblemsInRange(fromDate,days);
    const beforeKeys=new Set(before.map(problemPositionKey));
    const after=problemsForTemporarySettings(tempSettings,fromDate,days);
    return after.filter(p=>!beforeKeys.has(problemPositionKey(p)));
  }

  function vacancyForNewEmployee(role,startDate){
    const visible=employeesForDate(dateObjectFromKey(startDate))
      .filter(emp=>
        emp.role===role &&
        emp.inactive &&
        (emp.isExtra!==true || !emp.employmentStart || emp.employmentStart<=startDate)
      );

    if(!visible.length) return null;

    const leftDateFor=name=>{
      const left=(settings.staffChanges||[])
        .filter(x=>x.type==="left" && x.oldName===name && x.date<=startDate)
        .slice()
        .sort((a,b)=>b.date.localeCompare(a.date))[0];
      return left?.date||"";
    };

    visible.sort((a,b)=>{
      if((a.isExtra===true)!==(b.isExtra===true)) return a.isExtra===true?1:-1;
      return leftDateFor(b.name).localeCompare(leftDateFor(a.name));
    });

    const emp=visible[0];
    return {
      emp,
      left:{date:leftDateFor(emp.name)}
    };
  }

  function bestGroupForNewEmployee(role,startDate,workDays,offDays){
    const baseline=scheduleProblemsInRange(startDate,60);
    const baselineKeys=new Set(baseline.map(problemPositionKey));
    const candidates=[0,1].map(group=>{
      const temp=clone(settings);
      temp.employeeSchedules=temp.employeeSchedules||[];
      temp.employeeSchedules.push({
        id:`placement-preview-${group}`,
        name:`__placement_${group}__`,
        role,
        group,
        slot:0,
        workDays,
        offDays,
        cycleStart:startDate,
        employmentStart:startDate,
        isExtra:true,
        scheduleChanges:[]
      });
      const after=problemsForTemporarySettings(temp,startDate,60);
      const newCount=after.filter(p=>!baselineKeys.has(problemPositionKey(p))).length;
      return {group,newCount,total:after.length};
    });

    candidates.sort((a,b)=>a.newCount-b.newCount || a.total-b.total || a.group-b.group);
    return candidates[0]||{group:0,newCount:0,total:0};
  }

  function refreshNewEmployeePlaceNote(){
    const role=$("newEmployeeRole").value==="master"?"master":"manager";
    const startDate=$("newEmployeeStart").value||moscowParts().date;
    const vacancy=vacancyForNewEmployee(role,startDate);
    const note=$("newEmployeePlaceNote");
    if(!note) return;

    if(vacancy){
      note.innerHTML=`Есть свободное место после <b>${escapeHtml(vacancy.emp.name)}</b>. Новый сотрудник займёт именно это место с выбранной даты.`;
    }else{
      note.textContent="Свободного места нет. Приложение само выберет Моба/Нова так, чтобы создать как можно меньше пересечений.";
    }
  }

  function openAddEmployeeModal(){
    if(!isAdmin()){ openLoginModal(); return; }

    $("newEmployeeName").value="";
    $("newEmployeeRole").value="manager";
    $("newEmployeePreset").value="2/2";
    $("newEmployeeWorkDays").value=2;
    $("newEmployeeOffDays").value=2;
    $("newEmployeeStart").value=moscowParts().date;
    updateNewEmployeeCustomFields();
    refreshNewEmployeePlaceNote();
    $("addEmployeeModal").classList.remove("hidden");
    setTimeout(()=>$("newEmployeeName").focus(),50);
  }

  async function saveNewEmployee(){
    if(!isAdmin()){ openLoginModal(); return; }

    const name=$("newEmployeeName").value.trim();
    const role=$("newEmployeeRole").value==="master"?"master":"manager";
    const startDate=$("newEmployeeStart").value;
    const workDays=Math.max(1,Math.min(14,Number($("newEmployeeWorkDays").value)||2));
    const offDays=Math.max(1,Math.min(14,Number($("newEmployeeOffDays").value)||2));

    if(!name){ toast("Напиши имя сотрудника"); return; }
    if(!startDate){ toast("Выбери первый рабочий день"); return; }

    const activeDuplicate=activeEmployeeNames(startDate).some(n=>n.toLowerCase()===name.toLowerCase());
    if(activeDuplicate){
      toast("Сотрудник с таким именем уже работает");
      return;
    }

    const busy=beginButtonBusy("saveAddEmployee","Добавляем…");
    if(!busy) return;
    const previous=clone(settings);

    try{
      const vacancy=vacancyForNewEmployee(role,startDate);
      const temp=clone(settings);
      temp.employeeSchedules=temp.employeeSchedules||[];
      temp.staffChanges=temp.staffChanges||[];

      let placementText="";

      if(vacancy){
        const slot=temp.employeeSchedules.find(x=>String(x.id)===String(vacancy.emp.id));
        if(!slot) throw new Error("Не удалось найти свободное место");

        temp.staffChanges.push({
          id:`replace-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          date:startDate,
          oldName:vacancy.emp.name,
          newName:name,
          type:"replace"
        });
        temp.staffChanges.sort((a,b)=>a.date.localeCompare(b.date));
        setEmployeeScheduleChange(slot,startDate,workDays,offDays);
        placementText=`место после ${vacancy.emp.name}`;
      }else{
        const best=bestGroupForNewEmployee(role,startDate,workDays,offDays);
        temp.employeeSchedules.push({
          id:`employee-new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name,
          role,
          group:Number(best.group)===1?1:0,
          slot:0,
          workDays,
          offDays,
          cycleStart:startDate,
          employmentStart:startDate,
          isExtra:true,
          scheduleChanges:[]
        });
        placementText=best.group===0?"автоматически подобрана группа 1":"автоматически подобрана группа 2";
      }

      const newProblems=newlyCreatedProblems(temp,startDate,60);
      if(newProblems.length){
        const affected=new Set(newProblems.map(p=>`${p.date}|${p.service}`)).size;
        const ok=confirm(`Этот вариант создаст ${affected} новых смен, которые потребуют внимания в ближайшие 60 дней.\n\nВсё равно добавить сотрудника?`);
        if(!ok){ endButtonBusy(busy); return; }
      }

      settings=normalizeScheduleSettings(temp);
      if(cloudConfigured()) await saveToCloud(settings);
      saveSettings();

      lastSettingsSignature=stableJson(settings);
      settingsDirty=false;
      closeAddEmployeeModal();

      renderPinFields();
      fillHistoryFilters();
      if(!$("schedulePage").classList.contains("hidden")) renderMonth();
      if(isEmployeePhoneMode()) renderEmployeePages();
      renderTodayShifts();

      toast(`${name} добавлен · ${workDays}/${offDays} · ${placementText}`);
    }catch(e){
      console.error(e);
      settings=previous;
      saveSettings();
      toast(e.message||"Не удалось добавить сотрудника");
    }finally{
      endButtonBusy(busy);
    }
  }

  function updateEmployeeCustomFields(){
    const custom=$("employeeSchedulePreset").value==="custom";
    $("employeeWorkDays").closest(".field").classList.toggle("hidden",!custom);
    $("employeeOffDays").closest(".field").classList.toggle("hidden",!custom);
  }

  function openEmployeeScheduleEditor(id,effectiveDate=moscowParts().date,displayName=""){
    if(!isAdmin()){ openLoginModal(); return; }
    const emp=(settings.employeeSchedules||[]).find(x=>String(x.id)===String(id));
    if(!emp) return;

    const date=dateObjectFromKey(effectiveDate);
    if(isBalancedRosterRole(emp.role,date)){
      toast("Эта должность сейчас распределяется автоматически. Используй «Замена» или «Больше не работает».");
      return;
    }
    const visible=employeesForDate(date).find(x=>String(x.id)===String(id));
    const cycle=employeeCycleForDate(emp,date);

    $("employeeScheduleId").value=emp.id;
    $("employeeScheduleName").value=displayName || visible?.name || emp.name;
    $("employeeScheduleRole").value=roleLabel(emp.role);
    $("employeeWorkDays").value=cycle.workDays;
    $("employeeOffDays").value=cycle.offDays;
    $("employeeScheduleStart").min=effectiveDate;
    $("employeeScheduleStart").max="2100-12-31";
    $("employeeScheduleStart").value=effectiveDate;
    $("employeeSchedulePreset").value=presetForCycle(cycle.workDays,cycle.offDays);
    updateEmployeeCustomFields();
    $("employeePointRule").innerHTML=`Новый цикл начнётся с выбранной даты. Всё, что было раньше, останется без изменений. Для автоматической схемы точки закрепляются на периоды <b>1–15</b> и <b>16–конец месяца</b>.`;
    renderEmployeeSchedulePreview();
    $("employeeScheduleModal").classList.remove("hidden");
  }

  function closeEmployeeScheduleEditor(){
    $("employeeScheduleModal").classList.add("hidden");
  }

  function applyEmployeePreset(){
    const value=$("employeeSchedulePreset").value;
    if(value!=="custom"){
      const [work,off]=value.split("/").map(Number);
      $("employeeWorkDays").value=work;
      $("employeeOffDays").value=off;
    }
    updateEmployeeCustomFields();
    renderEmployeeSchedulePreview();
  }

  function syncEmployeePresetFromNumbers(){
    $("employeeSchedulePreset").value=presetForCycle($("employeeWorkDays").value,$("employeeOffDays").value);
    updateEmployeeCustomFields();
    renderEmployeeSchedulePreview();
  }

  function renderEmployeeSchedulePreview(){
    const id=$("employeeScheduleId").value;
    const original=(settings.employeeSchedules||[]).find(x=>String(x.id)===String(id));
    const root=$("employeeSchedulePreview");
    if(!original || !root) return;

    const work=Math.max(1,Math.min(14,Number($("employeeWorkDays").value)||2));
    const off=Math.max(1,Math.min(14,Number($("employeeOffDays").value)||2));
    const effectiveDate=$("employeeScheduleStart").value||moscowParts().date;

    const draft=clone(original);
    setEmployeeScheduleChange(draft,effectiveDate,work,off);

    const start=dateObjectFromKey(effectiveDate);
    const items=[];

    for(let i=0;i<14;i++){
      const date=new Date(start);
      date.setDate(start.getDate()+i);
      const works=employeeWorksOnDate(draft,date);
      const service=works?employeeServiceForDate(draft,date):"Выходной";
      items.push(`<div class="employee-preview-day ${works?"work":"off"}">
        <b>${date.getDate()} ${WD[date.getDay()]}</b>
        <span>${escapeHtml(service)}</span>
      </div>`);
    }
    root.innerHTML=items.join("");
  }

  async function saveEmployeeScheduleEditor(){
    if(!isAdmin()){ openLoginModal(); return; }

    const id=$("employeeScheduleId").value;
    const employee=(settings.employeeSchedules||[]).find(x=>String(x.id)===String(id));
    if(!employee) return;

    const displayName=$("employeeScheduleName").value.trim()||employee.name;
    const workDays=Math.max(1,Math.min(14,Number($("employeeWorkDays").value)||2));
    const offDays=Math.max(1,Math.min(14,Number($("employeeOffDays").value)||2));
    const effectiveDate=$("employeeScheduleStart").value||moscowParts().date;
    const minEffectiveDate=$("employeeScheduleStart").min||"2020-01-01";
    if(effectiveDate<minEffectiveDate){
      toast(`Выбери дату не раньше ${minEffectiveDate}`);
      return;
    }

    const busy=beginButtonBusy("saveEmployeeSchedule","Сохраняем…");
    if(!busy) return;
    const previous=clone(settings);
    const temp=clone(settings);
    const tempEmployee=(temp.employeeSchedules||[]).find(x=>String(x.id)===String(id));
    if(!tempEmployee){ endButtonBusy(busy); return; }

    setEmployeeScheduleChange(tempEmployee,effectiveDate,workDays,offDays);

    const newProblems=newlyCreatedProblems(temp,effectiveDate,60);
    if(newProblems.length){
      const affected=new Set(newProblems.map(p=>`${p.date}|${p.service}`)).size;
      const ok=confirm(`Этот новый график создаст ${affected} новых смен, которые потребуют внимания в ближайшие 60 дней.\n\nВсё равно сохранить?`);
      if(!ok){ endButtonBusy(busy); return; }
    }

    try{
      settings=normalizeScheduleSettings(temp);
      if(cloudConfigured()) await saveToCloud(settings);
      saveSettings();

      lastSettingsSignature=stableJson(settings);
      settingsDirty=false;
      closeEmployeeScheduleEditor();

      renderPinFields();
      fillHistoryFilters();
      if(!$("schedulePage").classList.contains("hidden")) renderMonth();
      if(isEmployeePhoneMode()) renderEmployeePages();
      renderTodayShifts();
      toast(`${displayName}: с ${effectiveDate} график ${workDays}/${offDays}`);
    }catch(e){
      console.error(e);
      settings=previous;
      saveSettings();
      toast(e.message||"Не удалось сохранить график");
    }finally{
      endButtonBusy(busy);
    }
  }

  function populateSettings(){
    $("anchorDate").value=settings.anchorDate;
    $("serviceBlockDays").value=settings.serviceBlockDays;
    $("service1").value=settings.service1; $("service2").value=settings.service2;
    $("shiftStart").value=settings.shiftStart; $("shiftEnd").value=settings.shiftEnd;

    renderPinFields();
    fillHistoryFilters();
    fillDeviceServiceSelect();
    updateCurrentScheduleSummary();
    updatePushState();
    renderDevicePanel();
    renderErrorLog();
    renderBackupStatus();
    updateSettingsSystemStatus();
  }

  function readSettingsFromForm(){
    const anchor=$("anchorDate").value||DEFAULTS.anchorDate;
    const next=normalizeScheduleSettings({
      ...settings,
      anchorDate:anchor,
      serviceBlockDays:Math.max(1,Math.min(60,Number($("serviceBlockDays").value)||14)),
      service1:$("service1").value.trim()||"Моба",
      service2:$("service2").value.trim()||"Нова",
      shiftStart:$("shiftStart").value||"08:00",
      shiftEnd:$("shiftEnd").value||"22:00",
      employeeSchedules:settings.employeeSchedules||[],
      staffChanges:settings.staffChanges||[],
      dayOverrides:settings.dayOverrides||[]
    });
    syncLegacyTeamsFromEmployees(next);
    return next;
  }

  function baseExpectedForDate(dateStr,serviceName){
    try{
      const [y,m,d]=dateStr.split("-").map(Number);
      if(y<2020 || y>2100) return null;
      const base=baseScheduleForDate(new Date(y,m-1,d));
      const pair=serviceName===settings.service1 ? base.s1 : serviceName===settings.service2 ? base.s2 : null;
      return pair ? {manager:pair.manager,master:pair.master} : null;
    }catch(e){ return null; }
  }

  function quickReplacementRecord(date,service){
    const key=serviceKeyForName(service);
    return (settings.dayOverrides||[]).find(x=>
      x.date===date &&
      ((x.serviceKey && x.serviceKey===key) || (!x.serviceKey && x.service===service))
    )||null;
  }

  function quickReplacementCandidates(date,role){
    try{
      const [y,m,d]=date.split("-").map(Number);
      const day=new Date(y,m-1,d);
      const idx=monthIndexForYearMonth(y,m-1);
      const row=daySchedule(idx,d);

      const busy=new Set([
        ...scheduleValueNames(row.s1.manager),
        ...scheduleValueNames(row.s1.master),
        ...scheduleValueNames(row.s2.manager),
        ...scheduleValueNames(row.s2.master)
      ]);

      const list=employeesForDate(day)
        .filter(x=>
          x.role===role &&
          !x.inactive &&
          (x.isExtra!==true || !x.employmentStart || x.employmentStart<=date) &&
          !busy.has(x.name)
        )
        .map(x=>x.name);

      return [...new Set(list.filter(Boolean))];
    }catch(e){ return []; }
  }

  function inferQuickReplaceRole(base,existing){
    if(existing?.replacedRole) return existing.replacedRole;
    if(existing && base){
      if(existing.manager!==base.manager && existing.master===base.master) return "manager";
      if(existing.master!==base.master && existing.manager===base.manager) return "master";
    }
    return "manager";
  }

  function refreshQuickReplaceForm(){
    const date=$("quickReplaceDate").value||moscowParts().date;
    const service=$("quickReplaceService").value||settings.service1;
    const base=baseExpectedForDate(date,service);
    const existing=quickReplacementRecord(date,service);
    if(!base) return;

    const roleSel=$("quickReplaceRole");
    const requestedRole=quickReplaceFixedContext
      ? (roleSel.value||"manager")
      : (roleSel.value || inferQuickReplaceRole(base,existing));

    roleSel.innerHTML=`
      <option value="manager">Менеджер — ${escapeHtml(base.manager)}</option>
      <option value="master">Мастер — ${escapeHtml(base.master)}</option>`;
    roleSel.value=["manager","master"].includes(requestedRole)?requestedRole:"manager";

    const role=roleSel.value;
    const absent=role==="manager"?base.manager:base.master;
    let candidates=quickReplacementCandidates(date,role).filter(n=>n!==absent);
    const currentReplacement=existing ? (role==="manager"?existing.manager:existing.master) : "";

    if(currentReplacement && currentReplacement!==absent && !candidates.includes(currentReplacement)){
      candidates.unshift(currentReplacement);
    }
    candidates=[...new Set(candidates)];

    const replaceSel=$("quickReplaceWith");
    replaceSel.innerHTML=candidates.length
      ? '<option value="">Выберите сотрудника</option>'+
        candidates.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")
      : '<option value="">Нет свободных сотрудников</option>';

    if(currentReplacement && candidates.includes(currentReplacement)){
      replaceSel.value=currentReplacement;
    }

    const serviceClass=serviceKeyForName(service);
    const summary=$("quickReplaceSummary");
    summary.className=`quick-replace-summary ${serviceClass?`service-${serviceClass}`:""}`.trim();
    summary.innerHTML=`
      <div class="replace-place">${escapeHtml(service)} <span class="replace-date">· ${escapeHtml(russianDateLong(date))}</span></div>
      <div class="replace-person">Меняем: ${escapeHtml(absent)}</div>
      <div class="replace-role">${role==="manager"?"Менеджер":"Мастер"}</div>
    `;

    $("quickReplaceWithLabel").textContent=`Кто выйдет вместо ${absent}?`;

    const box=$("quickReplaceExisting");
    const removeBtn=$("removeQuickReplace");
    const saveBtn=$("saveQuickReplace");

    if(existing){
      const changedRole=inferQuickReplaceRole(base,existing);
      const original=existing.replacedName || (changedRole==="manager"?base.manager:base.master);
      const replacement=changedRole==="manager"?existing.manager:existing.master;
      const reason=existing.reason?` · ${escapeHtml(existing.reason)}`:"";

      box.innerHTML=`Сейчас стоит замена: <b>${escapeHtml(original)} → ${escapeHtml(replacement)}</b>${reason}`;
      box.classList.remove("hidden");
      removeBtn.textContent=`Вернуть ${original} по графику`;
      removeBtn.classList.remove("hidden");
      saveBtn.textContent="Изменить замену";

      if(existing.reason && [...$("quickReplaceReason").options].some(o=>o.value===existing.reason)){
        $("quickReplaceReason").value=existing.reason;
      }else{
        $("quickReplaceReason").value="";
      }
    }else{
      box.classList.add("hidden");
      box.innerHTML="";
      removeBtn.classList.add("hidden");
      saveBtn.textContent="Заменить";
      $("quickReplaceReason").value="";
    }

    saveBtn.disabled=!candidates.length;
  }

  function openQuickReplace(){
    if(!isAdmin()){ openLoginModal(); return; }

    quickReplaceFixedContext=false;
    $("quickReplaceTitle").textContent="Замена сегодня";
    $("quickReplaceContextFields").classList.remove("hidden");

    $("quickReplaceDate").value=moscowParts().date;
    $("quickReplaceService").innerHTML=`
      <option value="${escapeHtml(settings.service1)}">${escapeHtml(settings.service1)}</option>
      <option value="${escapeHtml(settings.service2)}">${escapeHtml(settings.service2)}</option>`;
    $("quickReplaceService").value=settings.service1;
    $("quickReplaceRole").innerHTML='<option value="manager">Менеджер</option><option value="master">Мастер</option>';
    $("quickReplaceRole").value="manager";

    refreshQuickReplaceForm();
    $("quickReplaceModal").classList.remove("hidden");
  }

  function closeQuickReplace(){
    $("quickReplaceModal").classList.add("hidden");
    quickReplaceFixedContext=false;
  }

  async function persistQuickReplacement(previousSettings,successText){
    try{
      settings=normalizeScheduleSettings(settings);
      saveSettings();
      if(cloudConfigured()) await saveToCloud(settings);
      settingsDirty=false;
      lastSettingsSignature=stableJson(settings);
      populateSettings();
      renderMonth();
      closeQuickReplace();
      toast(successText);
    }catch(e){
      console.error(e);
      settings=previousSettings;
      saveSettings();
      populateSettings();
      renderMonth();
      setCloudStatus("Ошибка","offline");
      toast(e.message||"Не удалось сохранить замену");
    }
  }

  async function saveQuickReplacement(){
    if(!isAdmin()){ openLoginModal(); return; }
    if(quickReplaceSaving) return;

    const date=$("quickReplaceDate").value;
    const service=$("quickReplaceService").value;
    const role=$("quickReplaceRole").value;
    const replacement=$("quickReplaceWith").value;
    const reason=$("quickReplaceReason").value;
    const base=baseExpectedForDate(date,service);

    if(!date || !service || !base || !replacement){
      toast("Выбери сотрудника на замену");
      return;
    }

    const absent=role==="manager"?base.manager:base.master;
    if(replacement===absent){
      toast("Выбери другого сотрудника");
      return;
    }

    quickReplaceSaving=true;
    const saveBtn=$("saveQuickReplace"), removeBtn=$("removeQuickReplace");
    const saveText=saveBtn.textContent, removeDisabled=removeBtn.disabled;
    saveBtn.disabled=true; removeBtn.disabled=true; saveBtn.textContent="Сохраняем…";

    const previousSettings=clone(settings);
    const existing=quickReplacementRecord(date,service);
    const current=existing
      ? {manager:existing.manager,master:existing.master}
      : {manager:base.manager,master:base.master};

    current[role]=replacement;

    {
      const serviceKey=serviceKeyForName(service);
      settings.dayOverrides=(settings.dayOverrides||[]).filter(x=>!(
        x.date===date &&
        ((x.serviceKey && x.serviceKey===serviceKey) || (!x.serviceKey && x.service===service))
      ));
    }
    settings.dayOverrides.push({
      id:`override-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date,serviceKey:serviceKeyForName(service),service,manager:current.manager,master:current.master,
      reason,replacedRole:role,replacedName:absent
    });
    settings.dayOverrides.sort((a,b)=>a.date.localeCompare(b.date));

    try{
      await persistQuickReplacement(previousSettings,`${absent} заменён на ${replacement}`);
    }finally{
      quickReplaceSaving=false;
      saveBtn.disabled=false;
      removeBtn.disabled=removeDisabled;
      saveBtn.textContent=saveText;
    }
  }

  async function removeQuickReplacement(){
    if(!isAdmin()) return;
    if(quickReplaceSaving) return;
    const date=$("quickReplaceDate").value;
    const service=$("quickReplaceService").value;
    if(!quickReplacementRecord(date,service)){
      toast("На эту дату замены нет");
      return;
    }
    quickReplaceSaving=true;
    const saveBtn=$("saveQuickReplace"), removeBtn=$("removeQuickReplace");
    const saveDisabled=saveBtn.disabled, removeText=removeBtn.textContent;
    saveBtn.disabled=true; removeBtn.disabled=true; removeBtn.textContent="Возвращаем…";

    const previousSettings=clone(settings);
    {
      const serviceKey=serviceKeyForName(service);
      settings.dayOverrides=(settings.dayOverrides||[]).filter(x=>!(
        x.date===date &&
        ((x.serviceKey && x.serviceKey===serviceKey) || (!x.serviceKey && x.service===service))
      ));
    }
    try{
      await persistQuickReplacement(previousSettings,"Вернули обычный график");
    }finally{
      quickReplaceSaving=false;
      saveBtn.disabled=saveDisabled;
      removeBtn.disabled=false;
      removeBtn.textContent=removeText;
    }
  }

  async function saveForm(){
    const s=readSettingsFromForm();
    const validationError=coreSettingsValidationError(s);
    if(validationError){ toast(validationError); return; }
    if(cloudConfigured() && !isAdmin()){ openLoginModal(); toast("Сначала войди как администратор"); return; }

    const busy=beginButtonBusy("saveSettingsBtn","Сохраняем…");
    if(!busy) return;

    const renamed=[];
    if(s.service1!==settings.service1) renamed.push(settings.service1);
    if(s.service2!==settings.service2) renamed.push(settings.service2);

    if(renamed.length && isAdmin()){
      const devicesLoaded=await loadRegisteredDevices();
      if(!devicesLoaded){
        toast("Не удалось проверить рабочие устройства. Переименование отменено.");
        endButtonBusy(busy);
        return;
      }
      const active=deviceListCache.filter(d=>d.active && renamed.includes(d.service));
      if(active.length){
        const names=[...new Set(active.map(d=>d.service))].join(", ");
        toast(`Сначала отключи рабочее устройство точки: ${names}`);
        endButtonBusy(busy);
        return;
      }

      const todayRows=(currentShiftRows||[]).filter(r=>
        renamed.includes(r.service) &&
        !r.voided_at
      );
      if(todayRows.length){
        toast("Сегодня уже есть запись смены со старым названием точки. Переименуй точку после завершения дня.");
        endButtonBusy(busy);
        return;
      }
    }

    const previous=clone(settings);
    try{
      if(cloudConfigured()) await saveToCloud(s);
      settings=s;
      currentIndex=getCurrentMonthIndex();
      userSelectedMonth=false;
      saveSettings();
      settingsDirty=false;
      lastSettingsSignature=stableJson(settings);
      setCloudStatus(cloudConfigured()?"Онлайн":"Локально",cloudConfigured()?"online":"offline");
      toast(cloudConfigured()?"График сохранён для всех":"Сохранено только на этом устройстве");
      switchTab("schedule");
    }catch(e){
      console.error(e);
      settings=previous;
      setCloudStatus("Ошибка","offline");
      toast(e.message||"Изменения не сохранены");
    }finally{
      endButtonBusy(busy);
    }
  }

  function switchTab(tab){
    const employeeMode=isEmployeePhoneMode();
    const serviceMode=isServiceDeviceMode();

    if(tab==="more"){
      openMobileMoreMenu();
      return;
    }

    if(employeeMode && ["adminToday","schedule","desktopCalendar","history","settings","wallets"].includes(tab)){
      tab="employeeToday";
    }

    if(serviceMode && !["adminToday","schedule","desktopCalendar"].includes(tab)){
      tab="adminToday";
    }

    if((tab==="settings" || tab==="history" || tab==="wallets") && cloudConfigured() && !isAdmin()){
      if(serviceMode){
        tab="adminToday";
      }else{
        openLoginModal();
        return;
      }
    }

    const empToday=tab==="employeeToday";
    const empMy=tab==="employeeMy";
    const empCal=tab==="employeeCalendar";
    const adminToday=tab==="adminToday";
    const sched=tab==="schedule";
    const desktopCal=tab==="desktopCalendar";
    const hist=tab==="history";
    const kpi=tab==="kpi";
    const sett=tab==="settings";
    const wallets=tab==="wallets";

    $("employeeTodayPage").classList.toggle("hidden",!empToday);
    $("employeeMyPage").classList.toggle("hidden",!empMy);
    $("employeeCalendarPage").classList.toggle("hidden",!empCal);
    $("desktopCalendarPage").classList.toggle("hidden",!desktopCal);
    $("adminTodayPage").classList.toggle("hidden",!adminToday);
    $("schedulePage").classList.toggle("hidden",!sched);
    $("historyPage").classList.toggle("hidden",!hist);
    $("kpiPage").classList.toggle("hidden",!kpi);
    $("settingsPage").classList.toggle("hidden",!sett);
    $("walletsPage").classList.toggle("hidden",!wallets);
    $("scheduleControls").classList.toggle("hidden",!sched);

    document.querySelectorAll(".tab").forEach(b=>{
      if(!b.classList.contains("hidden")) b.classList.toggle("active",b.dataset.tab===tab);
    });
    const moreTab=$("bottomTabMore");
    if(moreTab) moreTab.classList.toggle("active",isMobileAdminNav() && (hist || sett));

    if(employeeMode && (empToday || empMy || empCal)){
      employeeMobileView=tab;
      ensureEmployeeSelected();
      renderEmployeePages();
    }

    if(adminToday){
      renderTodayShifts();
      loadTodayShifts(false);
    }
    if(sett){
      settingsDirty=false;
      populateSettings();
      updateCloudSettingsState();
      updatePushState();
    }
    if(wallets){
      renderWallets();
      syncWalletsCloud(false);
    }
    if(hist){
      fillHistoryFilters();
      if(!$("historyFrom").value) defaultHistoryDates();
      loadHistory();
    }
    if(kpi){
      if($("kpiMonth") && !$("kpiMonth").value) $("kpiMonth").value=moscowParts().date.slice(0,7);
      loadKpi();
    }
    if(sched){
      renderMonth();
    }
    if(desktopCal){
      renderDesktopCalendar();
    }

    window.scrollTo({top:0,behavior:"smooth"});
  }
  function exportSettings(){
    downloadFullBackup("MA_Grafik_full_backup");
    toast("Полная резервная копия скачана");
  }
  function importSettings(file){
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
  }

  // ---------- PNG poster ----------
  function canvasRoundRect(ctx,x,y,w,h,r,fill,stroke){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
  }

  function fitText(ctx,text,maxWidth,startSize,minSize=20,weight=600){
    let size=startSize;
    do{
      ctx.font=`${weight} ${size}px -apple-system,BlinkMacSystemFont,Segoe UI,Arial`;
      if(ctx.measureText(text).width<=maxWidth) return size;
      size-=1;
    }while(size>=minSize);
    return minSize;
  }

  function drawText(ctx,text,x,y,size,weight=500,color="#162033",align="left"){
    ctx.font=`${weight} ${size}px -apple-system,BlinkMacSystemFont,Segoe UI,Arial`;
    ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="middle";ctx.fillText(text,x,y);
  }

  function renderMonthCanvas(){
    const info=monthInfo(currentIndex), rows=buildMonthRows(currentIndex);
    const W=1400, H=1900, pad=44, cardW=W-pad*2;
    const canvas=document.createElement("canvas"); canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#f4f7fb";ctx.fillRect(0,0,W,H);
    drawText(ctx,`${info.name} ${info.year}`,W/2,72,54,800,"#0f5bd7","center");
    drawText(ctx,`Смена ${settings.shiftStart}–${settings.shiftEnd} • ${settings.service1} / ${settings.service2}`,W/2,122,25,500,"#64748b","center");

    const firstEnd=Math.min(15,info.days);
    const serviceTop=[160,1010];
    const serviceKeys=["s1","s2"];
    const serviceNames=[settings.service1,settings.service2];
    for(let s=0;s<2;s++){
      const y=serviceTop[s], cardH=790;
      ctx.shadowColor="rgba(28,64,120,.10)";ctx.shadowBlur=22;ctx.shadowOffsetY=8;
      canvasRoundRect(ctx,pad,y,cardW,cardH,26,"#ffffff");
      ctx.shadowColor="transparent";
      drawText(ctx,serviceNames[s],pad+28,y+45,38,800,"#0f5bd7");
      const colGap=22,colW=(cardW-56-colGap)/2;
      const colX=[pad+28,pad+28+colW+colGap];
      const ranges=[[1,firstEnd],[16,info.days]];
      for(let c=0;c<2;c++){
        const [a,b]=ranges[c];
        if(a>b) continue;
        drawText(ctx,`${a}–${b} число`,colX[c],y+92,24,800,"#0f5bd7");
        const tx=colX[c], ty=y+120, tableW=colW, rowH=38, headH=42;
        canvasRoundRect(ctx,tx,ty,tableW,headH+(b-a+1)*rowH,14,"#ffffff","#dbe5f2");
        ctx.fillStyle="#eaf2ff";ctx.fillRect(tx,ty,tableW,headH);
        drawText(ctx,"Дата / день",tx+18,ty+headH/2,18,700,"#31435d");
        drawText(ctx,"Менеджер + мастер",tx+tableW*0.40,ty+headH/2,18,700,"#31435d");
        ctx.strokeStyle="#dbe5f2";ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(tx+tableW*0.34,ty);ctx.lineTo(tx+tableW*0.34,ty+headH+(b-a+1)*rowH);ctx.stroke();
        let ri=0;
        for(let d=a;d<=b;d++,ri++){
          const r=rows[d-1], pair=r[serviceKeys[s]], ry=ty+headH+ri*rowH;
          if(ri>0){ctx.beginPath();ctx.moveTo(tx,ry);ctx.lineTo(tx+tableW,ry);ctx.stroke();}
          drawText(ctx,`${d} ${WD[r.date.getDay()]}`,tx+18,ry+rowH/2,18,500,"#334155");
          const txt=`${pair.manager} + ${pair.master}`;
          const fs=fitText(ctx,txt,tableW*0.62-22,19,15,650);
          drawText(ctx,txt,tx+tableW*0.40,ry+rowH/2,fs,650,"#162033");
        }
      }
    }
    drawText(ctx,"Актуальный график сотрудников",W/2,H-42,23,600,"#64748b","center");
    return canvas;
  }

  async function canvasBlob(){
    const c=renderMonthCanvas();
    const blob=await new Promise(res=>c.toBlob(res,"image/png",1));
    if(!blob) throw new Error("Не удалось создать изображение графика");
    return blob;
  }

  async function sharePhoto(){
    const busy=beginButtonBusy("shareBtn","Готовим график…");
    if(!busy) return;
    try{
      const blob=await canvasBlob(), info=monthInfo(currentIndex);
      const file=new File([blob],`График_${info.name}_${info.year}.png`,{type:"image/png"});
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
        try{
          await navigator.share({files:[file],title:`График ${info.name} ${info.year}`});
        }catch(e){
          if(e.name!=="AbortError") throw e;
        }
      }else{
        downloadBlob(blob);
        toast("PNG графика сохранён");
      }
    }catch(e){
      console.error(e);
      toast(e.message||"Не удалось подготовить график");
    }finally{
      endButtonBusy(busy);
    }
  }


  function downloadBlob(blob){
    const info=monthInfo(currentIndex),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`График_${info.name}_${info.year}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function openLoginModal(){
    if(!cloudConfigured()){
      toast("Сначала подключи Supabase в HTML");
      switchTabLocalSettings();
      return;
    }
    $("loginError").textContent="";
    $("adminPassword").value="";
    $("loginModal").classList.remove("hidden");
    setTimeout(()=>$("adminEmail").focus(),100);
  }

  function closeLoginModal(){
    $("loginModal").classList.add("hidden");
    $("loginError").textContent="";
  }

  function switchTabLocalSettings(){
    const sched=false;
    $("schedulePage").classList.toggle("hidden",!sched);
    $("desktopCalendarPage").classList.add("hidden");
    $("historyPage").classList.add("hidden");
    $("kpiPage").classList.add("hidden");
    $("settingsPage").classList.toggle("hidden",sched);
    $("walletsPage").classList.add("hidden");
    $("scheduleControls").classList.toggle("hidden",!sched);
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab==="settings"));
    populateSettings(); updateCloudSettingsState();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function handleLogin(){
    const email=$("adminEmail").value.trim();
    const password=$("adminPassword").value;
    if(!email || !password){ $("loginError").textContent="Введи email и пароль"; return; }
    $("loginBtn").disabled=true; $("loginBtn").textContent="Вход…"; $("loginError").textContent="";
    try{
      await loginAdmin(email,password);
      await loadRegisteredDevices();
      closeLoginModal(); toast("Вход выполнен"); switchTab("adminToday");
    }catch(e){ $("loginError").textContent=e.message || "Не удалось войти"; }
    finally{ $("loginBtn").disabled=false; $("loginBtn").textContent="Войти"; }
  }

  // ---------- Events ----------
  $("prevBtn").onclick=()=>navigateVisibleMonth(-1);
  $("nextBtn").onclick=()=>navigateVisibleMonth(1);
  $("todayMonthBtn").onclick=()=>{
    currentIndex=getCurrentMonthIndex();
    userSelectedMonth=true;
    renderMonth();
    window.scrollTo({top:0,behavior:"smooth"});
  };
  monthSelect.onchange=()=>{
    currentIndex=monthIndexForYearMonth(Number(yearSelect.value),Number(monthSelect.value));
    userSelectedMonth=true;
    renderMonth();
  };
  yearSelect.onchange=()=>{
    currentIndex=monthIndexForYearMonth(Number(yearSelect.value),Number(monthSelect.value));
    userSelectedMonth=true;
    renderMonth();
  };
  employeeFilter.onchange=highlightEmployee;
  $("changeEmployeeGlobal").onclick=openEmployeePicker;
  $("employeeCalPrev").onclick=()=>setEmployeeCalendarMonth(employeeCalendarIndex-1);
  $("employeeCalNext").onclick=()=>setEmployeeCalendarMonth(employeeCalendarIndex+1);
  $("desktopCalPrev").onclick=()=>setDesktopCalendarMonth(desktopCalendarIndex-1);
  $("desktopCalNext").onclick=()=>setDesktopCalendarMonth(desktopCalendarIndex+1);
  $("refreshBtn").onclick=async()=>{ await syncFromCloud(true); await loadTodayShifts(false); };
  $("loadHistoryBtn").onclick=loadHistory;
  document.querySelectorAll("#historyQuick [data-range]").forEach(btn=>{
    btn.onclick=()=>setHistoryQuickRange(btn.dataset.range,true);
  });
  $("historyCustomBtn").onclick=()=>{
    $("historyCustomRange").classList.toggle("hidden");
    document.querySelectorAll("#historyQuick [data-range]").forEach(b=>b.classList.remove("active"));
    $("historyCustomBtn").classList.toggle("active",!$("historyCustomRange").classList.contains("hidden"));
  };
  ["historyService","historyEmployee","historyProblem"].forEach(id=>{
    $(id).onchange=()=>loadHistory();
  });
  $("addEmployeeBtn").onclick=openAddEmployeeModal;
  $("closeAddEmployee").onclick=closeAddEmployeeModal;
  $("cancelAddEmployee").onclick=closeAddEmployeeModal;
  $("addEmployeeModal").addEventListener("click",e=>{ if(e.target===$("addEmployeeModal")) closeAddEmployeeModal(); });
  $("newEmployeePreset").onchange=applyNewEmployeePreset;
  $("newEmployeeWorkDays").oninput=syncNewEmployeePreset;
  $("newEmployeeOffDays").oninput=syncNewEmployeePreset;
  $("newEmployeeRole").onchange=refreshNewEmployeePlaceNote;
  $("newEmployeeStart").onchange=refreshNewEmployeePlaceNote;
  $("saveAddEmployee").onclick=saveNewEmployee;

  $("closeEmployeeSchedule").onclick=closeEmployeeScheduleEditor;
  $("cancelEmployeeSchedule").onclick=closeEmployeeScheduleEditor;
  $("employeeScheduleModal").addEventListener("click",e=>{ if(e.target===$("employeeScheduleModal")) closeEmployeeScheduleEditor(); });
  $("employeeSchedulePreset").onchange=applyEmployeePreset;
  $("employeeWorkDays").oninput=syncEmployeePresetFromNumbers;
  $("employeeOffDays").oninput=syncEmployeePresetFromNumbers;
  $("employeeScheduleStart").onchange=renderEmployeeSchedulePreview;
  $("saveEmployeeSchedule").onclick=saveEmployeeScheduleEditor;
  $("quickReplaceBtn").onclick=openQuickReplace;
  $("closeScheduleManage").onclick=()=>$("scheduleManageModal").classList.add("hidden");
  $("scheduleManageModal").addEventListener("click",e=>{ if(e.target===$("scheduleManageModal")) $("scheduleManageModal").classList.add("hidden"); });
  $("closeQuickReplace").onclick=closeQuickReplace;
  $("cancelQuickReplace").onclick=closeQuickReplace;
  $("quickReplaceModal").addEventListener("click",e=>{ if(e.target===$("quickReplaceModal")) closeQuickReplace(); });
  $("quickReplaceDate").onchange=refreshQuickReplaceForm;
  $("quickReplaceService").onchange=refreshQuickReplaceForm;
  $("quickReplaceRole").onchange=refreshQuickReplaceForm;
  $("saveQuickReplace").onclick=saveQuickReplacement;
  $("removeQuickReplace").onclick=removeQuickReplacement;
  $("savePinsBtn").onclick=saveManagerPins;
  $("pairDeviceBtn").onclick=pairCurrentDevice;
  $("enablePushBtn").onclick=enablePush;
  $("enableEmployeeReminders").onclick=enableEmployeeReminders;
  $("disableEmployeeReminders").onclick=disableEmployeeReminders;
  $("adminBtn").onclick=()=>{ if(isAdmin()) switchTab("settings"); else openLoginModal(); };
  $("closeServiceDay").onclick=()=>$("serviceDayModal").classList.add("hidden");
  $("serviceDayModal").addEventListener("click",e=>{ if(e.target===$("serviceDayModal")) $("serviceDayModal").classList.add("hidden"); });
  $("shareBtn").onclick=sharePhoto;
  $("saveSettingsBtn").onclick=saveForm;
  $("forceSyncBtn").onclick=()=>syncFromCloud(true);
  $("logoutBtn").onclick=()=>{ saveAdminSession(null); settingsDirty=false; renderTodayShifts(); applyUserMode(); switchTab(isEmployeePhoneMode()?"employeeToday":"adminToday"); toast("Вы вышли из администратора"); };
  $("closeLogin").onclick=closeLoginModal;
  $("cancelLogin").onclick=closeLoginModal;
  $("loginBtn").onclick=handleLogin;
  $("adminPassword").addEventListener("keydown",e=>{ if(e.key==="Enter") handleLogin(); });
  $("loginModal").addEventListener("click",e=>{ if(e.target===$("loginModal")) closeLoginModal(); });
  $("closeShiftAction").onclick=closeShiftAction; $("cancelShiftAction").onclick=closeShiftAction; $("confirmShiftAction").onclick=confirmShiftAction;
  $("shiftPin").addEventListener("keydown",e=>{ if(e.key==="Enter") confirmShiftAction(); });
  $("shiftActionModal").addEventListener("click",e=>{ if(e.target===$("shiftActionModal")) closeShiftAction(); });
  $("closeEditShift").onclick=closeEditShift; $("cancelEditShift").onclick=closeEditShift; $("saveEditShift").onclick=saveEditShift;
  $("editShiftModal").addEventListener("click",e=>{ if(e.target===$("editShiftModal")) closeEditShift(); });
  $("exportBtn").onclick=exportSettings;
  $("manualBackupBtn").onclick=()=>createDataBackup("Ручная автокопия",true,true);
  $("restoreLatestBackupBtn").onclick=restoreLatestBackup;
  $("importBtn").onclick=()=>$("importFile").click();
  $("importFile").onchange=e=>{ if(e.target.files[0]) importSettings(e.target.files[0]); e.target.value=""; };
  $("resetBtn").onclick=async()=>{
    if(cloudConfigured() && !isAdmin()){ openLoginModal(); return; }
    const word=prompt("Опасное действие. Чтобы полностью сбросить настройки графика, введи слово СБРОСИТЬ");
    if(word!=="СБРОСИТЬ"){ if(word!==null) toast("Сброс отменён"); return; }
    if(!confirm("Последняя проверка: действительно сбросить все настройки графика?")) return;

    const busy=beginButtonBusy("resetBtn","Сбрасываем…");
    if(!busy) return;
    const previous=clone(settings);
    const next=normalizeScheduleSettings(clone(DEFAULTS));

    try{
      createDataBackup("Перед полным сбросом графика",false,false);
      settings=next;
      saveSettings();
      if(cloudConfigured()) await saveToCloud(settings);
      settingsDirty=false;
      currentIndex=getCurrentMonthIndex();
      userSelectedMonth=false;
      lastSettingsSignature=stableJson(settings);
      populateSettings();
      renderMonth();
      toast(cloudConfigured()?"Настройки графика сброшены для всех":"Настройки сброшены");
    }catch(e){
      console.error(e);
      settings=previous;
      saveSettings();
      settingsDirty=false;
      lastSettingsSignature=stableJson(settings);
      populateSettings();
      renderMonth();
      toast("Сброс не выполнен — прежние настройки восстановлены");
    }finally{
      endButtonBusy(busy);
    }
  };

  $("installGrafikBtn").onclick=installGrafikApp;

  window.addEventListener("beforeinstallprompt",(event)=>{
    event.preventDefault();
    deferredGrafikInstallPrompt=event;
    updateInstallUI();
  });

  window.addEventListener("appinstalled",()=>{
    grafikAppInstalled=true;
    deferredGrafikInstallPrompt=null;
    updateInstallUI();
    toast("Приложение установлено");
  });


  $("openWalletDistribution").onclick=openWalletDistribution;
  $("closeWalletDistribution").onclick=closeWalletDistribution;
  $("cancelWalletDistribution").onclick=closeWalletDistribution;
  $("walletDistributionModal").addEventListener("click",e=>{ if(e.target===$("walletDistributionModal")) closeWalletDistribution(); });
  $("walletDistributionAmount").oninput=updateWalletDistributionPreview;
  $("confirmWalletDistribution").onclick=confirmWalletDistribution;

  $("walletSyncBtn").onclick=()=>syncWalletsCloud(true);
  $("walletPlanBtn").onclick=openWalletManagement;
  $("closeWalletPlan").onclick=closeWalletPlan;
  $("cancelWalletPlan").onclick=closeWalletPlan;
  $("walletPlanModal").addEventListener("click",e=>{ if(e.target===$("walletPlanModal")) closeWalletPlan(); });
  $("walletPlanFields").addEventListener("input",updateWalletPlanTotal);
  $("walletDistributionStrategy").onchange=updateWalletStrategyHelp;
  $("saveWalletPlan").onclick=saveWalletPlan;

  $("openWalletTransfer").onclick=()=>openWalletTransfer();
  $("closeWalletTransfer").onclick=closeWalletTransfer;
  $("cancelWalletTransfer").onclick=closeWalletTransfer;
  $("walletTransferModal").addEventListener("click",e=>{ if(e.target===$("walletTransferModal")) closeWalletTransfer(); });
  $("confirmWalletTransfer").onclick=confirmWalletTransfer;

  $("closeWalletTransaction").onclick=closeWalletTransaction;
  $("cancelWalletTransaction").onclick=closeWalletTransaction;
  $("walletTransactionModal").addEventListener("click",e=>{ if(e.target===$("walletTransactionModal")) closeWalletTransaction(); });
  $("confirmWalletTransaction").onclick=confirmWalletTransaction;
  $("walletsGrid").addEventListener("click",e=>{
    const toggle=e.target.closest("[data-wallet-overflow-toggle]");
    if(toggle){e.stopPropagation();toggleWalletOverflowMenu(toggle);return;}
    const btn=e.target.closest("[data-wallet-action]");
    if(!btn) return;
    closeWalletOverflowMenus();
    openWalletTransaction(btn.dataset.walletId,btn.dataset.walletAction);
  });
  $("walletFilterButtons").addEventListener("click",e=>{
    const btn=e.target.closest("[data-wallet-filter]");if(!btn)return;
    walletListFilter=["expense","savings"].includes(btn.dataset.walletFilter)?btn.dataset.walletFilter:"all";
    renderWallets();
  });

  $("walletMonthPrev").onclick=()=>{ walletViewMonthKey=walletShiftMonth(walletViewMonthKey,-1);renderWallets(); };
  $("walletMonthNext").onclick=()=>{ const next=walletShiftMonth(walletViewMonthKey,1);if(next<=walletCurrentMonthKey()){walletViewMonthKey=next;renderWallets();} };
  $("walletHistoryType").onchange=()=>renderWalletHistoryList($("walletHistoryList"),0,{filtered:true});
  $("walletHistoryWallet").onchange=()=>renderWalletHistoryList($("walletHistoryList"),0,{filtered:true});
  $("walletHistoryMonth").onchange=()=>renderWalletHistoryList($("walletHistoryList"),0,{filtered:true});
  const handleWalletHistoryAction=e=>{
    const correct=e.target.closest("[data-wallet-correct]");if(correct){openWalletCorrection(correct.dataset.walletCorrect);return;}
    const undo=e.target.closest("[data-wallet-undo]");if(undo){undoWalletOperation(undo.dataset.walletUndo);return;}
  };
  $("walletHistoryList").addEventListener("click",handleWalletHistoryAction);
  $("openWalletFullHistory").onclick=openWalletFullHistory;
  $("closeWalletFullHistory").onclick=closeWalletFullHistory;
  $("walletFullHistoryModal").addEventListener("click",e=>{if(e.target===$("walletFullHistoryModal"))closeWalletFullHistory();});

  $("closeWalletManage").onclick=closeWalletManagement;
  $("walletManageModal").addEventListener("click",e=>{ if(e.target===$("walletManageModal")) closeWalletManagement(); });
  $("addWalletBtn").onclick=()=>openWalletEdit();
  $("openWalletPlansFromManage").onclick=()=>{closeWalletManagement();openWalletPlan();};
  $("clearWalletHistoryBtn").onclick=clearWalletHistoryAndBalances;
  $("walletManageList").addEventListener("click",e=>{
    const toggle=e.target.closest("[data-wallet-overflow-toggle]");if(toggle){e.stopPropagation();toggleWalletOverflowMenu(toggle);return;}
    const edit=e.target.closest("[data-wallet-edit]");if(edit){closeWalletOverflowMenus();openWalletEdit(edit.dataset.walletEdit);return;}
    const archive=e.target.closest("[data-wallet-archive]");if(archive){closeWalletOverflowMenus();archiveWallet(archive.dataset.walletArchive);return;}
    const restore=e.target.closest("[data-wallet-restore]");if(restore){closeWalletOverflowMenus();restoreWallet(restore.dataset.walletRestore);return;}
    const del=e.target.closest("[data-wallet-delete]");if(del){closeWalletOverflowMenus();deleteWallet(del.dataset.walletDelete);return;}
    const move=e.target.closest("[data-wallet-move]");if(move){closeWalletOverflowMenus();moveWalletOrder(move.dataset.walletId,move.dataset.walletMove);return;}
  });

  $("closeWalletEdit").onclick=closeWalletEdit;
  $("cancelWalletEdit").onclick=closeWalletEdit;
  $("walletEditModal").addEventListener("click",e=>{ if(e.target===$("walletEditModal")) closeWalletEdit(); });
  $("walletEditType").onchange=()=>{syncWalletEditGoalVisibility();syncWalletEditPriorityVisibility();};
  $("saveWalletEdit").onclick=saveWalletEdit;

  document.addEventListener("click",e=>{ if(!e.target.closest(".wallet-overflow-wrap")) closeWalletOverflowMenus(); });
  window.addEventListener("keydown",e=>{ if(e.key==="Escape") closeWalletOverflowMenus(); });

  $("closeWalletCorrection").onclick=closeWalletCorrection;
  $("cancelWalletCorrection").onclick=closeWalletCorrection;
  $("walletCorrectionModal").addEventListener("click",e=>{ if(e.target===$("walletCorrectionModal")) closeWalletCorrection(); });
  $("saveWalletCorrection").onclick=saveWalletCorrection;

  if($("openKpiFromToday")) $("openKpiFromToday").onclick=()=>switchTab("kpi");
  if($("openKpiFromHistory")) $("openKpiFromHistory").onclick=()=>switchTab("kpi");
  if($("kpiBackBtn")) $("kpiBackBtn").onclick=()=>switchTab("adminToday");
  if($("kpiRefreshBtn")) $("kpiRefreshBtn").onclick=loadKpi;
  if($("kpiMonth")) $("kpiMonth").onchange=loadKpi;

  $("closeMobileMore").onclick=closeMobileMoreMenu;
  $("mobileMoreModal").addEventListener("click",e=>{ if(e.target===$("mobileMoreModal")) closeMobileMoreMenu(); });
  document.querySelectorAll("[data-mobile-more-tab]").forEach(b=>b.onclick=()=>openMobileMoreTab(b.dataset.mobileMoreTab));
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  let lastTouchEndForZoom=0;
  document.addEventListener("touchend",(e)=>{
    if(e.touches && e.touches.length>0) return;
    const now=Date.now();
    if(now-lastTouchEndForZoom<280){
      e.preventDefault();
    }
    lastTouchEndForZoom=now;
  },{passive:false});

  if(window.matchMedia("(max-width:760px)").matches){
    ["settingsScheduleFold","settingsPinsFold","settingsDevicesFold"].forEach(id=>{ const el=$(id); if(el) el.open=false; });
  }

  function refreshResponsiveLayout(){
    const wasEmployee=document.body.classList.contains("employee-phone-mode");
    const nowEmployee=isEmployeePhoneMode();
    applyUserMode();
    if(!isMobileAdminNav()) closeMobileMoreMenu();
    if(wasEmployee!==nowEmployee){
      switchTab(nowEmployee?"employeeToday":"adminToday");
      return;
    }
    const more=$("bottomTabMore");
    if(more) more.classList.toggle("active",isMobileAdminNav() && (!$("historyPage").classList.contains("hidden") || !$("kpiPage").classList.contains("hidden") ||
         !$("settingsPage").classList.contains("hidden")));
  }

  function scheduleResponsiveRefresh(){
    if(responsiveRefreshTimer) clearTimeout(responsiveRefreshTimer);
    responsiveRefreshTimer=setTimeout(()=>{
      responsiveRefreshTimer=null;
      refreshResponsiveLayout();
    },120);
  }

  async function refreshAppAfterResume(reason="resume",force=false){
    if(!appInitialized || document.hidden) return false;
    const now=Date.now();
    if(resumeRefreshPromise) return resumeRefreshPromise;
    if(!force && now-lastResumeRefreshAt<1200) return true;
    lastResumeRefreshAt=now;

    resumeRefreshPromise=(async()=>{
      refreshResponsiveLayout();
      if(Date.now()-lastServiceWorkerUpdateAt>60000){
        await registerServiceWorker({checkUpdate:true});
      }
      if(isAdmin()){
        try{ await getAdminToken(); }catch(e){ logAppError("resume auth refresh",e,{reason}); }
      }
      if(!cloudConfigured()) return true;
      const tasks=[syncFromCloud(false),loadTodayShifts(false)];
      if(isAdmin() && !$("walletsPage").classList.contains("hidden")) tasks.push(syncWalletsCloud(false));
      await Promise.allSettled(tasks);
      return true;
    })();
    try{ return await resumeRefreshPromise; }
    finally{ resumeRefreshPromise=null; }
  }

  window.addEventListener("resize",scheduleResponsiveRefresh,{passive:true});
  window.addEventListener("orientationchange",scheduleResponsiveRefresh,{passive:true});
  window.addEventListener("pageshow",e=>{ if(e.persisted) refreshAppAfterResume("pageshow-bfcache",true); else scheduleResponsiveRefresh(); });
  window.addEventListener("focus",()=>refreshAppAfterResume("focus"));
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refreshAppAfterResume("visibility"); });
  window.addEventListener("online",()=>{
    setCloudStatus(cloudConfigured()?"Онлайн":"Локально",cloudConfigured()?"online":"offline");
    refreshAppAfterResume("online",true);
  });
  window.addEventListener("offline",()=>{ setCloudStatus("Нет связи","offline"); });
  const scheduleSettingInputIds=new Set(["service1","service2","shiftStart","shiftEnd"]);
  $("settingsPage").addEventListener("input",e=>{
    if(scheduleSettingInputIds.has(e.target.id)) markDirty();
  });

  // Init
  async function initApp(){
    if(isStartupShiftMode()) document.body.classList.add("startup-shift-mode");

    lastSettingsSignature=stableJson(settings);

    // Сразу поднимаем последние данные из телефона/компьютера.
    currentShiftRows=loadCachedTodayShifts();
    const cachedDevice=loadCachedDeviceView();
    if(cachedDevice) currentDeviceAccess=cachedDevice;

    // Если это уже известное устройство — показываем правильный экран сразу.
    // Если токен есть, но кеша ещё нет (первый запуск после обновления),
    // один раз ждём проверку, чтобы Моба/Нова не мигали.
    const hasDeviceToken=!!loadShiftDeviceToken();
    if(hasDeviceToken && !cachedDevice){
      let initialDeviceResolved=false;
      const initialDeviceCheck=Promise.resolve()
        .then(()=>refreshDeviceAccess())
        .catch(e=>{
          console.error("initial device check",e);
          return false;
        });
      await Promise.race([
        initialDeviceCheck.then(()=>{ initialDeviceResolved=true; }),
        new Promise(resolve=>setTimeout(resolve,3500))
      ]);
      if(!initialDeviceResolved){
        initialDeviceCheck.then(()=>{
          if(appInitialized && currentDeviceAccess.allowed){
            updateAuthUI();
            applyUserMode();
            switchTab(isEmployeePhoneMode()?"employeeToday":"adminToday");
          }
        });
      }
    }

    updateAuthUI();
    applyUserMode();
    switchTab(isEmployeePhoneMode()?"employeeToday":"adminToday");
    document.body.classList.remove("app-booting");
    appInitialized=true;

    // Всё сетевое — уже после показа интерфейса.
    registerServiceWorker({checkUpdate:true}).then(()=>{ updatePushState(); updateInstallUI(); });
    updateInstallUI();

    const backgroundTasks=[];

    if(!hasDeviceToken || cachedDevice){
      backgroundTasks.push(refreshDeviceAccess());
    }

    backgroundTasks.push(loadTodayShifts(false,true));

    if(isAdmin()) backgroundTasks.push(loadRegisteredDevices());

    if(cloudConfigured()){
      backgroundTasks.push(syncFromCloud(false));
      if(isAdmin()) backgroundTasks.push(syncWalletsCloud(false));

      // Защита от повторной инициализации: одновременно существует только по одному таймеру.
      if(syncTimer) clearInterval(syncTimer);
      if(shiftPollTimer) clearInterval(shiftPollTimer);
      syncTimer=setInterval(()=>{
        if(!document.hidden){
          syncFromCloud(false);
          if(isAdmin() && !$("walletsPage").classList.contains("hidden")) syncWalletsCloud(false);
        }
      },SYNC_INTERVAL_MS);

      shiftPollTimer=setInterval(()=>{
        if(!document.hidden) loadTodayShifts(false);
      },SHIFT_POLL_MS);
    }else{
      setCloudStatus("Локально","offline");
    }

    Promise.allSettled(backgroundTasks).then(()=>{
      if(isStartupShiftMode()) renderStartupShiftWindow();
    });
  }

  initApp().catch(e=>{
    logAppError("init",e);
    document.body.classList.remove("app-booting");
    setCloudStatus("Ошибка запуска","offline");
  });
})();
