(function(global){
  "use strict";

  global.MASupabase={
    create(deps){
      if(!deps) throw new Error("MA Supabase: dependencies are required");
      const SUPABASE_URL=String(deps.url||"");
      const SUPABASE_PUBLISHABLE_KEY=String(deps.publishableKey||"");
      const getAdminSession=typeof deps.getAdminSession==="function" ? deps.getAdminSession : (()=>null);
      const saveAdminSession=typeof deps.saveAdminSession==="function" ? deps.saveAdminSession : (()=>{});

      function cloudConfigured(){
        return /^https:\/\/.+\.supabase\.co$/i.test(SUPABASE_URL) &&
          !!SUPABASE_PUBLISHABLE_KEY &&
          !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
      }

      function sleepMs(ms){
        return new Promise(resolve=>setTimeout(resolve,ms));
      }

      async function httpErrorFromResponse(res,fallback="Ошибка запроса"){
        let body="";
        try{ body=await res.text(); }catch(_){ }
        const message=body || `${fallback} (HTTP ${res.status})`;
        const err=new Error(message);
        err.status=Number(res.status)||0;
        err.statusText=String(res.statusText||"");
        return err;
      }

      function classifySyncError(error){
        const status=Number(error?.status||0);
        const text=String(error?.message||error||"").toLowerCase();
        if(typeof navigator!=="undefined" && navigator.onLine===false) return {kind:"offline",status};
        if(status===401 || text.includes("jwt expired") || text.includes("invalid jwt")) return {kind:"auth",status};
        if(status===403) return {kind:"forbidden",status};
        if([408,425,429,500,502,503,504].includes(status)) return {kind:"temporary",status};
        if(error?.name==="AbortError" || text.includes("timeout") || text.includes("timed out") || text.includes("failed to fetch") || text.includes("networkerror") || text.includes("network request failed")) return {kind:"temporary",status};
        return {kind:"other",status};
      }

      async function authFetch(path,options={}){
        if(!cloudConfigured()) throw new Error("Supabase не настроен");
        const method=String(options.method||"GET").toUpperCase();
        const retryAttempts=Math.max(1,Math.min(3,Number(options.retryAttempts ?? (method==="GET"?3:1))||1));
        const timeoutMs=Math.max(3000,Math.min(20000,Number(options.timeoutMs||8000)||8000));
        const fetchOptions={...options};
        delete fetchOptions.retryAttempts;
        delete fetchOptions.timeoutMs;
        const headers=Object.assign({"apikey":SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},fetchOptions.headers||{});
        fetchOptions.headers=headers;
        if(method==="GET" && fetchOptions.cache===undefined) fetchOptions.cache="no-store";

        let lastError=null;
        for(let attempt=1;attempt<=retryAttempts;attempt++){
          const controller=!fetchOptions.signal && typeof AbortController!=="undefined" ? new AbortController() : null;
          const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
          try{
            const res=await fetch(SUPABASE_URL+path,{...fetchOptions,signal:fetchOptions.signal||controller?.signal});
            if(timer) clearTimeout(timer);
            const hidden=typeof document!=="undefined" && document.hidden;
            if(method==="GET" && attempt<retryAttempts && [408,425,429,500,502,503,504].includes(res.status) && !hidden){
              await sleepMs(attempt===1?350:900);
              continue;
            }
            return res;
          }catch(e){
            if(timer) clearTimeout(timer);
            lastError=e;
            const online=typeof navigator==="undefined" || navigator.onLine!==false;
            const hidden=typeof document!=="undefined" && document.hidden;
            const retryable=method==="GET" && attempt<retryAttempts && online && !hidden;
            if(!retryable) throw e;
            await sleepMs(attempt===1?350:900);
          }
        }
        throw lastError||new Error("Не удалось выполнить запрос");
      }

      async function loginAdmin(email,password){
        const res=await authFetch("/auth/v1/token?grant_type=password",{
          method:"POST",
          body:JSON.stringify({email,password})
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok) throw new Error(data.msg || data.error_description || data.message || "Ошибка входа");
        data.expires_at_ms=Date.now()+((data.expires_in||3600)*1000);
        saveAdminSession(data);
        return data;
      }

      async function refreshAdminSession(){
        const session=getAdminSession();
        if(!session || !session.refresh_token) return null;
        const res=await authFetch("/auth/v1/token?grant_type=refresh_token",{
          method:"POST",
          body:JSON.stringify({refresh_token:session.refresh_token})
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok){
          saveAdminSession(null);
          return null;
        }
        data.expires_at_ms=Date.now()+((data.expires_in||3600)*1000);
        saveAdminSession(data);
        return data;
      }

      async function getAdminToken(){
        let session=getAdminSession();
        if(!session) return null;
        if(!session.expires_at_ms || session.expires_at_ms<Date.now()+60000){
          await refreshAdminSession();
          session=getAdminSession();
        }
        return session ? session.access_token : null;
      }

      return {
        cloudConfigured,
        sleepMs,
        httpErrorFromResponse,
        classifySyncError,
        authFetch,
        loginAdmin,
        refreshAdminSession,
        getAdminToken
      };
    }
  };
})(window);
