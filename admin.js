(function(global){
  "use strict";

  global.MAAdmin={
    create(deps){
      if(!deps) throw new Error("MA Admin: dependencies are required");
      const storageKey=String(deps.storageKey||"ma_schedule_admin_session_v1");
      const getSession=typeof deps.getSession==="function" ? deps.getSession : (()=>null);
      const setSession=typeof deps.setSession==="function" ? deps.setSession : (()=>{});
      const onSessionChange=typeof deps.onSessionChange==="function" ? deps.onSessionChange : (()=>{});

      function loadAdminSession(){
        try{
          const raw=localStorage.getItem(storageKey);
          return raw ? JSON.parse(raw) : null;
        }catch(e){
          return null;
        }
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
        onSessionChange(next);
      }

      function isAdmin(){
        const session=getSession();
        return !!(session && session.access_token);
      }

      function adminAccessToken(){
        const session=getSession();
        return session?.access_token || "";
      }

      return {loadAdminSession,saveAdminSession,isAdmin,adminAccessToken};
    }
  };
})(window);
