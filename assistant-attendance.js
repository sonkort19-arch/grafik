(function(global){
  "use strict";
  if(typeof document==="undefined"||typeof window==="undefined")return;
  if(global.__maAttendanceAssistantStarted)return;
  global.__maAttendanceAssistantStarted=true;

  const SUPABASE_URL="https://yedzfmibceboncrytbqz.supabase.co";
  const PUBLISHABLE_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const AUTH_KEY="ma_schedule_admin_session_v1";
  const API=`${SUPABASE_URL}/functions/v1/ma-grafik-attendance-api`;
  const core=global.MAAssistantCore;
  let busy=false;

  function normalize(v){return core?.normalizeText?core.normalizeText(v):String(v||"").toLowerCase().trim();}
  function isAttendance(text){
    const t=normalize(text);
    return /(пришел|пришла|пришли|приход|опозд|вовремя|не пришел|не пришла|не откры|открыл смен|во сколько.*(пришел|пришла)|кто.*сейчас.*работ|кто.*на работе)/.test(t);
  }
  function isForbiddenEdit(text){
    const t=normalize(text);
    return /(поменяй|измени|исправь|поставь|запиши).*(приход|пришел|опозд|время.*откр)/.test(t);
  }
  function session(){try{const x=JSON.parse(localStorage.getItem(AUTH_KEY)||"null");return x?.access_token?x:null;}catch(_){return null;}}
  async function refresh(){const s=session();if(!s?.refresh_token)return null;const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{"Content-Type":"application/json",apikey:PUBLISHABLE_KEY},body:JSON.stringify({refresh_token:s.refresh_token})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.access_token)return null;const n={...s,...d};localStorage.setItem(AUTH_KEY,JSON.stringify(n));return n;}
  async function call(text){
    let s=session();if(!s)throw new Error("Нужен вход администратора.");
    const url=new URL(API);url.searchParams.set("q",text);
    let r=await fetch(url,{headers:{Authorization:`Bearer ${s.access_token}`}});
    if(r.status===401){s=await refresh();if(!s)throw new Error("Нужен повторный вход администратора.");r=await fetch(url,{headers:{Authorization:`Bearer ${s.access_token}`}});}
    const d=await r.json().catch(()=>({}));if(!r.ok||!d?.ok)throw new Error(d?.error||`Ошибка ${r.status}`);return d;
  }
  function box(){return document.getElementById("maAssistantMessages");}
  function add(role,text){const b=box();if(!b)return;const m=document.createElement("div");m.className=`ma-msg ${role}`;m.textContent=String(text||"");b.appendChild(m);b.scrollTop=b.scrollHeight;}
  async function handle(text){
    if(busy)return;busy=true;
    try{
      add("user",text);
      if(isForbiddenEdit(text)){add("assistant","Изменение фактического времени прихода через помощника не поддерживается. История смен остаётся без изменений.");return;}
      const d=await call(text);add("assistant",d.answer||"Нет данных.");
    }catch(e){add("error",e?.message||"Не удалось получить данные о приходах.");}
    finally{busy=false;}
  }
  function intercept(text,event){if(!isAttendance(text))return false;event?.preventDefault?.();event?.stopImmediatePropagation?.();const input=document.getElementById("maAssistantInput");if(input)input.value="";handle(String(text||"").trim());return true;}
  document.addEventListener("click",e=>{const send=e.target?.closest?.("#maAssistantSend");if(!send)return;const input=document.getElementById("maAssistantInput");intercept(input?.value||"",e);},true);
  document.addEventListener("keydown",e=>{if(e.target?.id!=="maAssistantInput"||e.key!=="Enter"||e.shiftKey)return;intercept(e.target.value||"",e);},true);
})(typeof window!=="undefined"?window:globalThis);
