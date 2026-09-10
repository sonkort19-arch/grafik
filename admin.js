(function(global){
  "use strict";

  const DEFAULT_STORAGE_KEY="ma_schedule_admin_session_v1";
  const CRM_ADMIN_CLASS="ma-crm-admin-visible";

  function sessionIsAdmin(session){
    return !!(session && session.access_token);
  }

  function storedAdminSession(storageKey=DEFAULT_STORAGE_KEY){
    try{
      const raw=localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    }catch(e){
      return null;
    }
  }

  function syncCrmEntryVisibility(session,storageKey=DEFAULT_STORAGE_KEY){
    const allowed=session===undefined ? sessionIsAdmin(storedAdminSession(storageKey)) : sessionIsAdmin(session);
    const apply=()=>document.body?.classList.toggle(CRM_ADMIN_CLASS,allowed);
    if(document.body) apply();
    else document.addEventListener("DOMContentLoaded",apply,{once:true});
  }

  if(typeof document!=="undefined"){
    const style=document.createElement("style");
    style.id="maCrmAdminOnlyStyle";
    style.textContent="#maCrmEntry{display:none!important}body."+CRM_ADMIN_CLASS+" #maCrmEntry{display:inline-flex!important}";
    (document.head||document.documentElement).appendChild(style);
    syncCrmEntryVisibility(undefined,DEFAULT_STORAGE_KEY);
    window.addEventListener("storage",event=>{if(!event.key||event.key===DEFAULT_STORAGE_KEY)syncCrmEntryVisibility(undefined,DEFAULT_STORAGE_KEY);});
    window.addEventListener("focus",()=>syncCrmEntryVisibility(undefined,DEFAULT_STORAGE_KEY));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncCrmEntryVisibility(undefined,DEFAULT_STORAGE_KEY);});
  }

  global.MAAdmin={
    create(deps){
      if(!deps) throw new Error("MA Admin: dependencies are required");
      const storageKey=String(deps.storageKey||DEFAULT_STORAGE_KEY);
      const getSession=typeof deps.getSession==="function" ? deps.getSession : (()=>null);
      const setSession=typeof deps.setSession==="function" ? deps.setSession : (()=>{});
      const onSessionChange=typeof deps.onSessionChange==="function" ? deps.onSessionChange : (()=>{});

      function loadAdminSession(){
        const session=storedAdminSession(storageKey);
        syncCrmEntryVisibility(session,storageKey);
        return session;
      }

      function saveAdminSession(session){
        const next=session || null;
        setSession(next);
        try{
          if(next) localStorage.setItem(storageKey,JSON.stringify(next));
          else localStorage.removeItem(storageKey);
        }catch(e){
          console.error("admin session storage",e);
        }
        syncCrmEntryVisibility(next,storageKey);
        onSessionChange(next);
      }

      function isAdmin(){
        const session=getSession();
        return sessionIsAdmin(session);
      }

      function adminAccessToken(){
        const session=getSession();
        return session?.access_token || "";
      }

      return {loadAdminSession,saveAdminSession,isAdmin,adminAccessToken};
    }
  };
})(window);
