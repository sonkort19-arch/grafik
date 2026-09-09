(function(global){
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

// Минимальный загрузчик бесплатного помощника. Он отделён от app.js,
// чтобы помощник можно было отключить без изменения основной логики графика.
(function(){
  "use strict";
  if(typeof document==="undefined"||typeof window==="undefined")return;
  if(window.__maAssistantLoaderStarted)return;
  window.__maAssistantLoaderStarted=true;

  function load(src,onload){
    const script=document.createElement("script");
    script.src=src;
    script.defer=true;
    script.dataset.maAssistant="1";
    if(onload)script.onload=onload;
    script.onerror=()=>console.warn("MA Assistant: не удалось загрузить",src);
    document.head.appendChild(script);
  }

  load("assistant-core.js",()=>load("assistant.js"));
})();
