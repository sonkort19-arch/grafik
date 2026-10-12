(function(){
  "use strict";
  const API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-marketer";
  const KEY="ma_marketer_session_v1";
  const PUBLIC_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  let session=null;
  try{const raw=sessionStorage.getItem(KEY);if(raw){const s=JSON.parse(raw);if(s?.token && s.expiresAt>Date.now())session=s;else sessionStorage.removeItem(KEY);}}catch(_){}
  const $=id=>document.getElementById(id);
  const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const api=async(action,payload={})=>{
    const headers={"Content-Type":"application/json","apikey":PUBLIC_KEY};
    if(session?.token)headers.Authorization="Bearer "+session.token;
    const res=await fetch(API,{method:"POST",headers,body:JSON.stringify({action,...payload}),cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok)throw new Error(data.error||"Сервер недоступен");
    return data;
  };
  const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const defaultFrom=()=>new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const dateRU=key=>{const parts=String(key||"").split("-");return parts.length===3?parts.reverse().join("."):String(key||"");};
  function updateButton(){
    const button=$("irmaAccountBtn");
    if(button)button.textContent=session?.token&&session.expiresAt>Date.now()?"Ирма · Отчёты":"Вход Ирмы";
  }
  function openModal(){
    $("irmaModal").classList.remove("hidden");
    if(session?.token&&session.expiresAt>Date.now())showReports();
    else showLogin();
  }
  function closeModal(){$("irmaModal").classList.add("hidden");}
  function showLogin(){
    $("irmaLoginView").classList.remove("hidden");
    $("irmaReportsView").classList.add("hidden");
    $("irmaLoginError").textContent="";
    $("irmaUsername").value="irma";
    $("irmaPassword").value="";
    setTimeout(()=>$("irmaPassword").focus(),50);
  }
  function logout(){
    session=null;try{sessionStorage.removeItem(KEY);}catch(_){}
    updateButton();showLogin();
  }
  async function login(){
    const btn=$("irmaLoginSubmit");
    $("irmaLoginError").textContent="";
    btn.disabled=true;
    try{
      const data=await api("login",{username:$("irmaUsername").value.trim(),password:$("irmaPassword").value});
      session={token:data.token,expiresAt:data.expiresAt,username:data.username,employee:data.employee};
      sessionStorage.setItem(KEY,JSON.stringify(session));
      $("irmaPassword").value="";
      updateButton();showReports();
    }catch(e){$("irmaLoginError").textContent=e.message||"Вход не выполнен";}
    finally{btn.disabled=false;}
  }
  function showReports(){
    $("irmaLoginView").classList.add("hidden");
    $("irmaReportsView").classList.remove("hidden");
    $("irmaHeading").textContent="Ирма · Маркетолог";
    $("irmaReportFrom").value=$("irmaReportFrom").value||defaultFrom();
    $("irmaReportTo").value=$("irmaReportTo").value||today();
    loadReports();
  }
  async function loadReports(){
    const list=$("irmaReportsList");
    list.textContent="Загружаем отчёты…";
    $("irmaReportsError").textContent="";
    const button=$("irmaReportsRefresh");button.disabled=true;
    try{
      const data=await api("reports",{from:$("irmaReportFrom").value,to:$("irmaReportTo").value,service:$("irmaReportService").value});
      if(!data.reports.length){list.innerHTML='<div class="irma-empty">За выбранный период отчётов нет.</div>';return;}
      list.innerHTML=data.reports.map(r=>{
        const reasons=Array.isArray(r.reasons)?r.reasons:[];
        return `<details class="irma-report">
          <summary><strong>${escapeHtml(r.service||"Сервис")} · ${escapeHtml(dateRU(r.date))}</strong><span>${escapeHtml(r.totalAppeals)} обращений</span></summary>
          <div class="irma-report-body"><div><b>Менеджер:</b> ${escapeHtml(r.reportedBy||"—")}</div>
            <div style="margin-top:8px"><b>Почему ушли / результат обращений</b></div>
            ${reasons.length?`<ol>${reasons.map(reason=>`<li>${escapeHtml(reason)}</li>`).join("")}</ol>`:'<p>Обращений не было</p>'}
            <button type="button" class="secondary irma-copy" data-id="${escapeHtml(r.shiftId)}">Скопировать отчёт</button>
          </div>
        </details>`;
      }).join("");
      list.querySelectorAll(".irma-copy").forEach(btn=>{
        btn.onclick=async()=>{
          const r=data.reports.find(x=>String(x.shiftId)===btn.dataset.id);
          if(!r)return;
          const lines=[`Отчёт за ${dateRU(r.date)}`,`Всего обращений: ${r.totalAppeals}`,`Менеджер: ${r.reportedBy}`,"","Почему ушли / результат обращений:",...(r.reasons?.length?r.reasons.map((x,i)=>`${i+1}. ${x}`):["Обращений не было"])];
          try{await navigator.clipboard.writeText(lines.join("\n"));btn.textContent="Скопировано";}catch(_){btn.textContent="Не удалось скопировать";}
        };
      });
    }catch(e){
      list.textContent="";
      $("irmaReportsError").textContent=e.message||"Не удалось загрузить отчёты";
      if(/Сессия|Требуется вход|истекла/.test(e.message||""))logout();
    }finally{button.disabled=false;}
  }
  function init(){
    const adminBtn=$("adminBtn");
    if(!adminBtn)return;
    const button=document.createElement("button");
    button.type="button";button.id="irmaAccountBtn";button.className="authbtn irma-entry";
    adminBtn.parentNode.insertBefore(button,adminBtn);
    button.onclick=openModal;
    const modal=document.createElement("div");
    modal.className="modal hidden";modal.id="irmaModal";
    modal.innerHTML=`<div class="sheet irma-sheet" role="dialog" aria-modal="true" aria-label="Личный кабинет маркетолога">
      <div class="sheet-head"><h2 id="irmaHeading">Кабинет Ирмы</h2><button type="button" class="close" id="irmaClose" aria-label="Закрыть">×</button></div>
      <div id="irmaLoginView">
        <div class="notice" style="margin-top:12px">Маркетолог видит общий график сотрудников и дневные отчёты сервисов. Настройки владельца недоступны.</div>
        <div class="field" style="margin-top:12px"><label for="irmaUsername">Логин</label><input id="irmaUsername" type="text" autocomplete="username" value="irma"></div>
        <div class="field"><label for="irmaPassword">Пароль</label><input id="irmaPassword" type="password" autocomplete="current-password"></div>
        <div class="login-error" id="irmaLoginError" role="alert"></div>
        <div class="login-actions"><button type="button" class="primary" id="irmaLoginSubmit">Войти</button></div>
      </div>
      <div id="irmaReportsView" class="hidden">
        <div class="notice" style="margin:12px 0">График сотрудников доступен на основном экране. Здесь — отчёты по обращениям и закрытым сменам.</div>
        <div class="irma-filters">
          <label>С <input id="irmaReportFrom" type="date"></label><label>По <input id="irmaReportTo" type="date"></label>
          <label>Точка<select id="irmaReportService"><option value="">Обе точки</option><option value="Моба">Моба</option><option value="Нова">Нова</option></select></label>
        </div>
        <div class="irma-actions"><button type="button" class="primary" id="irmaReportsRefresh">Показать отчёты</button><button type="button" class="secondary" id="irmaLogout">Выйти из аккаунта</button></div>
        <div class="login-error" id="irmaReportsError" role="alert"></div>
        <div id="irmaReportsList"></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
    updateButton();
    $("irmaClose").onclick=closeModal;
    modal.onclick=e=>{if(e.target===modal)closeModal();};
    $("irmaLoginSubmit").onclick=login;
    $("irmaPassword").onkeydown=e=>{if(e.key==="Enter")login();};
    $("irmaReportsRefresh").onclick=loadReports;
    $("irmaLogout").onclick=logout;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
