(function(){
  "use strict";
  const API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-marketer";
  const STORAGE="ma_marketer_session_v1";
  const OWNER_STORAGE="ma_schedule_admin_session_v1";
  const el=id=>document.getElementById(id);
  const html=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function getSession(){
    try{const data=JSON.parse(sessionStorage.getItem(STORAGE)||"null");return data?.token&&new Date(data.expiresAt).getTime()>Date.now()?data:null;}
    catch(_){return null;}
  }
  function saveSession(data){if(data)sessionStorage.setItem(STORAGE,JSON.stringify(data));else sessionStorage.removeItem(STORAGE);}
  function ownerToken(){try{return JSON.parse(localStorage.getItem(OWNER_STORAGE)||"null")?.access_token||"";}catch(_){return "";}}
  async function api(op,payload={},accessToken=""){
    const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",...(accessToken?{Authorization:"Bearer "+accessToken}:{})},body:JSON.stringify({op,...payload}),cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.ok!==true)throw new Error(data.error||"Ошибка сервера");
    return data;
  }
  function section(loggedIn){
    el("marketingLoginSection").classList.toggle("hidden",loggedIn);
    el("marketingReportsSection").classList.toggle("hidden",!loggedIn);
    el("marketingOpenBtn").textContent=loggedIn?"Ирма · отчёты":"Маркетолог";
  }
  function dateText(value){
    const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?m[3]+"."+m[2]+"."+m[1]:String(value||"");
  }
  function reportText(report){
    const lines=["Отчёт за "+dateText(report.date),"Точка: "+report.service,"Всего обращений: "+report.totalAppeals,"Менеджер: "+report.reportedBy,"","Почему ушли / результат обращений:"];
    if(Array.isArray(report.reasons)&&report.reasons.length) report.reasons.forEach((reason,i)=>lines.push((i+1)+". "+reason));
    else lines.push("Обращений не было");
    return lines.join("\n");
  }
  function renderReports(reports){
    const list=el("marketingReportsList");list.replaceChildren();
    if(!Array.isArray(reports)||!reports.length){list.textContent="За выбранный период отчётов пока нет.";return;}
    reports.forEach(report=>{
      const card=document.createElement("article");card.className="ma-marketer-report";
      const title=document.createElement("h3");title.textContent=String(report.service||"")+" · "+dateText(report.date);
      const meta=document.createElement("div");meta.className="ma-report-meta";meta.textContent="Обращений: "+report.totalAppeals+" · Отчёт: "+String(report.reportedBy||"—");
      const desc=document.createElement("div");desc.className="ma-report-meta";desc.textContent="Почему ушли / результат обращений";
      card.append(title,meta,desc);
      if(Array.isArray(report.reasons)&&report.reasons.length){
        const ol=document.createElement("ol");
        report.reasons.forEach(reason=>{const li=document.createElement("li");li.textContent=String(reason);ol.appendChild(li);});
        card.appendChild(ol);
      }else{const p=document.createElement("p");p.textContent="Обращений не было";card.appendChild(p);}
      const btn=document.createElement("button");btn.type="button";btn.className="secondary";btn.textContent="Скопировать отчёт";
      btn.onclick=async()=>{try{await navigator.clipboard.writeText(reportText(report));btn.textContent="Скопировано";}catch(_){btn.textContent="Не удалось скопировать";}};
      const actions=document.createElement("div");actions.className="ma-marketer-report-actions";actions.appendChild(btn);card.appendChild(actions);list.appendChild(card);
    });
  }
  async function reload(){
    const session=getSession();if(!session){saveSession(null);section(false);return;}
    el("marketingReportsError").textContent="";
    el("marketingReportsList").textContent="Загружаем отчёты…";
    try{const data=await api("reports",{days:Number(el("marketingDays").value)},session.token);renderReports(data.reports);}
    catch(e){el("marketingReportsError").textContent=e.message||"Ошибка";if(/сессия|вход|доступ/i.test(e.message||"")){saveSession(null);section(false);}}
  }
  async function login(){
    const btn=el("marketingLoginBtn");btn.disabled=true;el("marketingLoginError").textContent="";
    try{
      const data=await api("login",{username:el("marketingLogin").value.trim(),password:el("marketingPassword").value});
      el("marketingPassword").value="";
      saveSession({token:data.token,expiresAt:data.expiresAt,employee:data.employee});
      section(true);await reload();
    }catch(e){el("marketingLoginError").textContent=e.message||"Ошибка входа";}
    finally{btn.disabled=false;}
  }
  async function setup(){
    const btn=el("marketingSetupBtn");btn.disabled=true;el("marketingSetupError").textContent="";
    try{
      const owner=ownerToken();if(!owner)throw new Error("Сначала войдите как администратор MA График");
      await api("setup",{username:"irma",employee:"Ирма",password:el("marketingSetupPassword").value},owner);
      el("marketingSetupPassword").value="";
      el("marketingSetupError").textContent="Доступ Ирмы создан. Войдите под её логином и паролем.";
    }catch(e){el("marketingSetupError").textContent=e.message||"Ошибка настройки";}
    finally{btn.disabled=false;}
  }
  function init(){
    const modal=el("marketingModal");if(!modal)return;
    function open(){modal.classList.remove("hidden");section(!!getSession());if(getSession())reload();}
    function close(){modal.classList.add("hidden");}
    el("marketingOpenBtn").onclick=open;el("marketingClose").onclick=close;
    modal.addEventListener("click",e=>{if(e.target===modal)close();});
    el("marketingLoginBtn").onclick=login;
    el("marketingPassword").addEventListener("keydown",e=>{if(e.key==="Enter")login();});
    el("marketingSetupBtn").onclick=setup;
    el("marketingReload").onclick=reload;
    el("marketingDays").onchange=reload;
    el("marketingLogout").onclick=async()=>{
      const s=getSession();if(s)try{await api("logout",{},s.token);}catch(_){}
      saveSession(null);section(false);
    };
    section(!!getSession());
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
