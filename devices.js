(function(global){
  "use strict";

  function create(options={}){
    const DEVICE_VIEW_CACHE_KEY=String(options.deviceViewCacheKey||"ma_device_view_cache_v1");
    const DEVICE_STORAGE_KEY=String(options.deviceStorageKey||"ma_shift_device_token_v1");
    const DEVICE_KEY_DB=String(options.deviceKeyDb||"ma_shift_device_keys_v1");
    const DEVICE_KEY_STORE=String(options.deviceKeyStore||"keys");
    let lastDeviceKeyReadFailed=false;

  function loadCachedDeviceView(){
    try{
      const raw=JSON.parse(localStorage.getItem(DEVICE_VIEW_CACHE_KEY)||"null");
      if(!raw?.device?.service || !loadShiftDeviceToken()) return null;
      if(Date.now()-Number(raw.savedAt||0)>1000*60*60*24*30) return null;
      return {allowed:true,device:raw.device,verified:false,cached:true};
    }catch(e){ return null; }
  }

  function saveCachedDeviceView(device){
    try{
      if(device?.service){
        localStorage.setItem(DEVICE_VIEW_CACHE_KEY,JSON.stringify({
          savedAt:Date.now(),
          device:{
            id:device.id||"",
            service:String(device.service),
            label:device.label?String(device.label):""
          }
        }));
      }else{
        localStorage.removeItem(DEVICE_VIEW_CACHE_KEY);
      }
    }catch(e){}
  }

  function loadShiftDeviceToken(){
    try{ return localStorage.getItem(DEVICE_STORAGE_KEY) || ""; }catch(e){ return ""; }
  }

  function saveShiftDeviceToken(token){
    try{
      if(token) localStorage.setItem(DEVICE_STORAGE_KEY,token);
      else localStorage.removeItem(DEVICE_STORAGE_KEY);
    }catch(e){}
  }

  function openDeviceKeyDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DEVICE_KEY_DB,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(DEVICE_KEY_STORE)) db.createObjectStore(DEVICE_KEY_STORE);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function loadDeviceKeyRecord(){
    lastDeviceKeyReadFailed=false;
    try{
      const db=await openDeviceKeyDB();
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(DEVICE_KEY_STORE,"readonly");
        const req=tx.objectStore(DEVICE_KEY_STORE).get("main");
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
    }catch(e){
      lastDeviceKeyReadFailed=true;
      console.error("device key read",e);
      return null;
    }
  }

  async function saveDeviceKeyRecord(record){
    const db=await openDeviceKeyDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DEVICE_KEY_STORE,"readwrite");
      tx.objectStore(DEVICE_KEY_STORE).put(record,"main");
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  async function clearDeviceKeyRecord(){
    try{
      const db=await openDeviceKeyDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(DEVICE_KEY_STORE,"readwrite");
        tx.objectStore(DEVICE_KEY_STORE).delete("main");
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
    }catch(e){
      console.error("device key clear",e);
    }
  }

  function bytesToBase64Url(bytes){
    let s="";
    new Uint8Array(bytes).forEach(b=>s+=String.fromCharCode(b));
    return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }

  async function generateDeviceKeyRecord(){
    if(!window.crypto?.subtle) throw new Error("Этот браузер не поддерживает защищённую привязку устройства");

    const generated=await crypto.subtle.generateKey(
      {name:"ECDSA",namedCurve:"P-256"},
      true,
      ["sign","verify"]
    );

    const publicJwk=await crypto.subtle.exportKey("jwk",generated.publicKey);
    const privateJwk=await crypto.subtle.exportKey("jwk",generated.privateKey);

    const privateKey=await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      {name:"ECDSA",namedCurve:"P-256"},
      false,
      ["sign"]
    );

    const publicKey=await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      {name:"ECDSA",namedCurve:"P-256"},
      true,
      ["verify"]
    );

    return {privateKey,publicKey,publicJwk,createdAt:Date.now()};
  }

  async function createDeviceKeyRecord(){
    const record=await generateDeviceKeyRecord();
    await saveDeviceKeyRecord(record);
    return record;
  }

  async function signDeviceProof(kind,fields=[]){
    const token=loadShiftDeviceToken();
    const record=await loadDeviceKeyRecord();
    if(!token || !record?.privateKey){
      throw new Error("Это устройство нужно заново зарегистрировать администратором");
    }

    const timestamp=Date.now();
    const message=[kind,...fields.map(x=>String(x??"")),String(timestamp),token].join("|");
    const signature=await crypto.subtle.sign(
      {name:"ECDSA",hash:"SHA-256"},
      record.privateKey,
      new TextEncoder().encode(message)
    );

    return {
      timestamp,
      signature:bytesToBase64Url(signature)
    };
  }


    return {
      loadCachedDeviceView,saveCachedDeviceView,loadShiftDeviceToken,saveShiftDeviceToken,
      loadDeviceKeyRecord,saveDeviceKeyRecord,clearDeviceKeyRecord,
      generateDeviceKeyRecord,createDeviceKeyRecord,signDeviceProof,
      lastKeyReadFailed:()=>lastDeviceKeyReadFailed
    };
  }

  global.MADevices={create};
})(typeof window!=="undefined" ? window : globalThis);
