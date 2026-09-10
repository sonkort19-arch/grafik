(function(global){
  "use strict";

  function create(options={}){
    const backupKey=String(options.backupKey||"ma_data_safety_backups_v1");
    const scheduleKey=String(options.scheduleKey||"ma_schedule_22_v2");
    const walletKey=String(options.walletKey||"ma_personal_wallets_v1");
    const maxBackups=Math.max(3,Math.min(20,Number(options.maxBackups)||8));
    const maxWalletBytes=Math.max(100000,Number(options.maxWalletBytes)||750000);
    const now=typeof options.now==="function"?options.now:()=>new Date();
    function storage(){try{return global.localStorage||globalThis.localStorage||null;}catch(_){return null;}}
    function raw(key){try{return storage()?.getItem(key)||"";}catch(_){return "";}}
    function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,"0");}
    function isoNow(){const value=now();const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();}
    function list(){try{const parsed=JSON.parse(raw(backupKey)||"[]");return Array.isArray(parsed)?parsed.filter(x=>x&&x.id&&x.at):[];}catch(_){return [];}}
    function write(entries){let next=entries.slice(0,maxBackups);while(next.length){try{storage()?.setItem(backupKey,JSON.stringify(next));return next;}catch(_){next=next.slice(0,-1);}}try{storage()?.removeItem(backupKey);}catch(_){ }return [];}
    function capture(reason="Автокопия",opts={}){const scheduleRaw=raw(scheduleKey);let walletRaw=opts.includeWallet?raw(walletKey):"";let walletSkipped=false;if(walletRaw&&walletRaw.length>maxWalletBytes){walletRaw="";walletSkipped=true;}if(!scheduleRaw&&!walletRaw)return null;const signature=hash(`${scheduleRaw}|${walletRaw}`);const entries=list();const at=isoNow();if(entries[0]&&entries[0].signature===signature){entries[0].lastSeenAt=at;entries[0].reason=String(reason||entries[0].reason||"Автокопия").slice(0,160);if(walletSkipped)entries[0].walletSkipped=true;write(entries);return entries[0];}const item={id:`backup-${Date.parse(at)||Date.now()}-${Math.random().toString(36).slice(2,8)}`,at,reason:String(reason||"Автокопия").slice(0,160),signature,scheduleRaw:scheduleRaw||"",walletRaw:walletRaw||"",walletSkipped};entries.unshift(item);write(entries);return item;}
    function latest(){return list()[0]||null;}
    function parseJson(rawValue){if(!rawValue)return null;const value=JSON.parse(rawValue);return value&&typeof value==="object"?value:null;}
    function scheduleFromSnapshot(snapshot){return parseJson(snapshot?.scheduleRaw||"");}
    function walletFromSnapshot(snapshot){return parseJson(snapshot?.walletRaw||"");}
    function exportBundle({settings,walletState}={}){return {format:"ma-grafik-backup",version:2,exportedAt:isoNow(),schedule:settings&&typeof settings==="object"?settings:null,wallets:walletState&&typeof walletState==="object"?walletState:null};}
    function parseBackupText(text){const parsed=JSON.parse(String(text||""));if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Неверный формат резервной копии");if(parsed.format==="ma-grafik-backup"){if(!parsed.schedule||typeof parsed.schedule!=="object")throw new Error("В резервной копии нет графика");return {format:"bundle",version:Number(parsed.version)||1,schedule:parsed.schedule,wallets:parsed.wallets&&typeof parsed.wallets==="object"?parsed.wallets:null};}return {format:"legacy",version:1,schedule:parsed,wallets:null};}
    function cloudConflict({knownUpdatedAt,remoteUpdatedAt,remoteSettings,nextSettings,stableStringify}={}){if(!knownUpdatedAt||!remoteUpdatedAt||String(knownUpdatedAt)===String(remoteUpdatedAt))return false;const stable=typeof stableStringify==="function"?stableStringify:(v=>JSON.stringify(v));try{return stable(remoteSettings)!==stable(nextSettings);}catch(_){return true;}}
    return {list,latest,capture,scheduleFromSnapshot,walletFromSnapshot,exportBundle,parseBackupText,cloudConflict};
  }
  global.MADataSafety={create};
})(typeof window!=="undefined"?window:globalThis);

(function(){
  "use strict";
  if(typeof document==="undefined"||typeof window==="undefined")return;
  if(window.__maAssistantLoaderStarted)return;
  window.__maAssistantLoaderStarted=true;
  const AUTH_KEY="ma_schedule_admin_session_v1";
  let coreLoaded=!!window.MAAssistantCore,coreLoading=false,assistantActive=false,lastAllowed=null;
  function hasAdminSession(){try{const raw=localStorage.getItem(AUTH_KEY);if(!raw)return false;const session=JSON.parse(raw);return !!(session&&session.access_token&&session.refresh_token);}catch(_){return false;}}
  function load(src,onload,kind){const script=document.createElement("script");script.src=src;script.defer=true;script.dataset.maAssistant="1";if(kind)script.dataset.maAssistantKind=kind;if(onload)script.onload=onload;script.onerror=()=>{if(kind==="core")coreLoading=false;if(kind==="runtime")assistantActive=false;console.warn("MA Assistant: не удалось загрузить",src);};document.head.appendChild(script);}
  function removeAssistantUi(){document.getElementById("maAssistantBackdrop")?.remove();document.getElementById("maAssistantLaunch")?.remove();document.querySelectorAll('script[data-ma-assistant-kind="runtime"],script[data-ma-assistant-kind="attendance"],script[data-ma-assistant-kind="owner"]').forEach(node=>node.remove());assistantActive=false;window.__maAttendanceAssistantStarted=false;window.__maOwnerAssistantStarted=false;}
  function startAssistant(){if(assistantActive||!hasAdminSession())return;const run=()=>{if(assistantActive||!hasAdminSession())return;assistantActive=true;load(`assistant.js?v=${Date.now()}`,()=>{if(!hasAdminSession())return;load(`assistant-attendance.js?v=${Date.now()}`,()=>{if(hasAdminSession())load(`assistant-owner.js?v=${Date.now()}`,null,"owner");},"attendance");},"runtime");};if(coreLoaded||window.MAAssistantCore){coreLoaded=true;run();return;}if(coreLoading)return;coreLoading=true;load("assistant-core.js",()=>{coreLoading=false;coreLoaded=!!window.MAAssistantCore;if(coreLoaded)run();},"core");}
  function syncAssistantAccess(){const allowed=hasAdminSession();if(allowed===lastAllowed){if(allowed&&!assistantActive&&!document.getElementById("maAssistantLaunch"))startAssistant();return;}lastAllowed=allowed;if(allowed)startAssistant();else removeAssistantUi();}
  window.addEventListener("storage",event=>{if(!event.key||event.key===AUTH_KEY)syncAssistantAccess();});window.addEventListener("focus",syncAssistantAccess);document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncAssistantAccess();});setInterval(syncAssistantAccess,700);setTimeout(syncAssistantAccess,250);
})();

(function(){
  "use strict";
  if(typeof document==="undefined"||typeof window==="undefined")return;
  function mountCrmButton(){
    if(document.getElementById("maCrmEntry"))return;
    const adminBtn=document.getElementById("adminBtn");
    const actions=adminBtn?.parentElement;
    if(!actions)return;
    const link=document.createElement("a");
    link.id="maCrmEntry";
    link.href="./crm.html";
    link.textContent="CRM";
    link.setAttribute("aria-label","Открыть MA CRM");
    link.style.cssText="display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 10px;border-radius:999px;border:1px solid #0f5bd7;background:#0f5bd7;color:#fff;text-decoration:none;font-size:12px;font-weight:800;white-space:nowrap";
    actions.insertBefore(link,adminBtn);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountCrmButton,{once:true});
  else mountCrmButton();
})();
