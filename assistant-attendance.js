(function(global){
  "use strict";
  if(typeof document==="undefined"||typeof window==="undefined")return;
  if(global.__maAttendanceAssistantStarted)return;
  global.__maAttendanceAssistantStarted=true;

  const SUPABASE_URL="https://yedzfmibceboncrytbqz.supabase.co";
  const PUBLISHABLE_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const AUTH_KEY="ma_schedule_admin_session_v1";
  const API=`${SUPABASE_URL}/functions/v1/ma-grafik-attendance-api`;
  const READ_API=`${SUPABASE_URL}/functions/v1/ma-grafik-api`;
  const core=global.MAAssistantCore;
  let busy=false;

  function normalize(v){return core?.normalizeText?core.normalizeText(v):String(v||"").toLowerCase().trim();}
  function isAttendance(text){
    const t=normalize(text);
    return /(пришел|пришла|пришли|приход|опозд|вовремя|не пришел|не пришла|не откры|открыл смен|во сколько.*(пришел|пришла)|кто.*сейчас.*работ|кто.*на работе)/.test(t);
  }
  function isEmployeeSchedule(text){
    const t=normalize(text);
    return /график/.test(t)||/когда\s+\S+\s+работ/.test(t)||/когда\s+работает\s+\S+/.test(t)||/в какие дни.*работ/.test(t);
  }
  function isForbiddenEdit(text){
    const t=normalize(text);
    return /(поменяй|измени|исправь|поставь|запиши).*(приход|пришел|опозд|время.*откр)/.test(t);
  }
  function session(){try{const x=JSON.parse(localStorage.getItem(AUTH_KEY)||"null");return x?.access_token?x:null;}catch(_){return null;}}
  async function refresh(){const s=session();if(!s?.refresh_token)return null;const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{"Content-Type":"application/json",apikey:PUBLISHABLE_KEY},body:JSON.stringify({refresh_token:s.refresh_token})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.access_token)return null;const n={...s,...d};localStorage.setItem(AUTH_KEY,JSON.stringify(n));return n;}
  async function authFetch(url){
    let s=session();if(!s)throw new Error("Нужен вход администратора.");
    let r=await fetch(url,{headers:{Authorization:`Bearer ${s.access_token}`}});
    if(r.status===401){s=await refresh();if(!s)throw new Error("Нужен повторный вход администратора.");r=await fetch(url,{headers:{Authorization:`Bearer ${s.access_token}`}});}
    return r;
  }
  async function call(text){
    const url=new URL(API);url.searchParams.set("q",text);
    const r=await authFetch(url);const d=await r.json().catch(()=>({}));if(!r.ok||!d?.ok)throw new Error(d?.error||`Ошибка ${r.status}`);return d;
  }
  async function readSchedule(from,to){
    const url=new URL(`${READ_API}/schedule`);url.searchParams.set("from",from);url.searchParams.set("to",to);
    const r=await authFetch(url);const d=await r.json().catch(()=>({}));if(!r.ok||!d?.ok)throw new Error(d?.error||`Ошибка ${r.status}`);return d;
  }
  function box(){return document.getElementById("maAssistantMessages");}
  function add(role,text){const b=box();if(!b)return;const m=document.createElement("div");m.className=`ma-msg ${role}`;m.textContent=String(text||"");b.appendChild(m);b.scrollTop=b.scrollHeight;}
  function dateLabel(key){const dt=core?.dateFromKey?.(key);if(!dt)return key;return new Intl.DateTimeFormat("ru-RU",{timeZone:"UTC",day:"numeric",month:"long",weekday:"short"}).format(dt);}
  function todayKey(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const o={};p.forEach(x=>{if(x.type!=="literal")o[x.type]=x.value;});return `${o.year}-${o.month}-${o.day}`;}
  function namesFromDays(days){const set=new Set();for(const day of days||[])for(const pair of Object.values(day.services||{})){for(const n of [pair?.manager,pair?.master])if(n&&!/^(не назначен|без |конфликт)/i.test(String(n)))set.add(String(n));}return [...set];}
  function assignmentFor(day,name){for(const [service,pair] of Object.entries(day.services||{})){if(normalize(pair?.manager)===normalize(name))return `${service}, ${normalize(pair?.master)===normalize(name)?"ответственный":"менеджер"}`;if(normalize(pair?.master)===normalize(name))return `${service}, мастер`;}return "выходной";}
  async function handleSchedule(text){
    if(busy)return;busy=true;
    try{
      add("user",text);
      const today=todayKey();const range=core.parseRange(text,today);const data=await readSchedule(range.from,range.to);
      const names=namesFromDays(data.days);const mentioned=core.findMentionedEmployees(text,names);
      if(!mentioned.length){
        const lines=[`График: ${dateLabel(range.from)} — ${dateLabel(range.to)}`];
        for(const day of data.days||[]){const parts=Object.entries(day.services||{}).map(([s,p])=>`${s}: ${p.manager}; ${p.master}`);lines.push(`${dateLabel(day.date)}\n${parts.join(" · ")}`);}add("assistant",lines.join("\n\n"));return;
      }
      const name=mentioned[0].name;const lines=[`${name}: ${dateLabel(range.from)} — ${dateLabel(range.to)}`];
      for(const day of data.days||[])lines.push(`${dateLabel(day.date)} — ${assignmentFor(day,name)}`);
      add("assistant",lines.join("\n"));
    }catch(e){add("error",e?.message||"Не удалось получить график.");}
    finally{busy=false;}
  }
  async function handleAttendance(text){
    if(busy)return;busy=true;
    try{add("user",text);if(isForbiddenEdit(text)){add("assistant","Изменение фактического времени прихода через помощника не поддерживается. История смен остаётся без изменений.");return;}const d=await call(text);add("assistant",d.answer||"Нет данных.");}
    catch(e){add("error",e?.message||"Не удалось получить данные о приходах.");}
    finally{busy=false;}
  }
  function intercept(text,event){
    const clean=String(text||"").trim();if(!clean)return false;
    let handler=null;if(isAttendance(clean))handler=handleAttendance;else if(isEmployeeSchedule(clean))handler=handleSchedule;else return false;
    event?.preventDefault?.();event?.stopImmediatePropagation?.();const input=document.getElementById("maAssistantInput");if(input)input.value="";handler(clean);return true;
  }
  function cleanQuickActions(){
    const wrap=document.querySelector(".ma-assistant-examples");if(!wrap)return false;
    [...wrap.querySelectorAll("button")].forEach(btn=>{if(/сделать замену/i.test(btn.textContent||""))btn.remove();});
    wrap.style.gridTemplateColumns="minmax(0,1fr) minmax(0,1fr)";return true;
  }
  let tries=0;const timer=setInterval(()=>{tries++;if(cleanQuickActions()||tries>30)clearInterval(timer);},200);
  document.addEventListener("click",e=>{const send=e.target?.closest?.("#maAssistantSend");if(!send)return;const input=document.getElementById("maAssistantInput");intercept(input?.value||"",e);},true);
  document.addEventListener("keydown",e=>{if(e.target?.id!=="maAssistantInput"||e.key!=="Enter"||e.shiftKey)return;intercept(e.target.value||"",e);},true);
})(typeof window!=="undefined"?window:globalThis);
