(()=>{
  "use strict";

  const API_URL="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const CRM_EMPLOYEE_KEY="ma_crm_employee_v1";
  const EMPLOYEE_KEY="ma_employee_name_v1";

  const STATUS={
    accepted:"Принят",
    diagnostics:"Диагностика",
    in_work:"В работе",
    waiting_part:"Ждём запчасть",
    ready:"Готов",
    issued:"Выдан"
  };
  const STATUS_ORDER=Object.keys(STATUS);

  const $=id=>document.getElementById(id);
  const state={
    bootstrap:null,
    repairs:[],
    sales:[],
    repairStatus:"",
    repairService:"",
    repairQuery:"",
    saleQuery:"",
    currentRepair:null,
    repairLoadSeq:0,
    saleLoadSeq:0
  };
  let toastTimer=null;
  let repairSearchTimer=null;
  let saleSearchTimer=null;

  class AuthError extends Error{}

  function esc(value){
    return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  }
  function num(value){ const n=Number(value); return Number.isFinite(n)?n:0; }
  function money(value){
    return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value))+" ₽";
  }
  function dateTime(value){
    if(!value) return "—";
    const d=new Date(value); if(Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);
  }
  function toast(message){
    const root=$("crmToast"); root.textContent=String(message||""); root.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>root.classList.remove("show"),2600);
  }
  function setBusy(button,busy,text){
    if(!button) return;
    if(busy){ button.dataset.oldText=button.textContent; button.disabled=true; if(text) button.textContent=text; }
    else{ button.disabled=false; if(button.dataset.oldText) button.textContent=button.dataset.oldText; delete button.dataset.oldText; }
  }
  function readJsonStorage(key){
    try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}
  }
  function adminToken(){ return readJsonStorage(ADMIN_SESSION_KEY)?.access_token||""; }
  function crmSession(){ try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return "";} }
  function authHeaders(){
    const headers={"Content-Type":"application/json","apikey":API_KEY};
    const admin=adminToken(),staff=crmSession();
    if(admin) headers.Authorization=`Bearer ${admin}`;
    if(staff) headers["x-crm-session"]=staff;
    return headers;
  }
  async function api(op,payload={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),18000);
    try{
      const res=await fetch(API_URL,{method:"POST",headers:authHeaders(),body:JSON.stringify({op,...payload}),signal:controller.signal,cache:"no-store"});
      const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));
      if(!res.ok||data?.ok===false){
        const msg=data?.error||`Ошибка ${res.status}`;
        if(res.status===403) throw new AuthError(msg);
        throw new Error(msg);
      }
      return data;
    }catch(e){
      if(e?.name==="AbortError") throw new Error("Сервер долго не отвечает. Проверь интернет.");
      throw e;
    }finally{ clearTimeout(timer); }
  }

  function showLogin(message=""){
    $("crmMain").classList.add("hidden");
    $("loginOverlay").classList.remove("hidden");
    const remembered=localStorage.getItem(CRM_EMPLOYEE_KEY)||localStorage.getItem(EMPLOYEE_KEY)||"";
    if(!$("crmLoginName").value) $("crmLoginName").value=remembered;
    $("crmLoginError").textContent=message;
    setTimeout(()=>remembered?$("crmLoginPin").focus():$("crmLoginName").focus(),30);
  }
  function showMain(){
    $("loginOverlay").classList.add("hidden");
    $("crmMain").classList.remove("hidden");
  }
  function actorName(){ return state.bootstrap?.actor?.employee||localStorage.getItem(CRM_EMPLOYEE_KEY)||""; }
  function updateUser(){
    const actor=state.bootstrap?.actor;
    $("crmUser").textContent=actor ? (actor.kind==="admin"?"Администратор":actor.employee) : "CRM";
  }

  function employeeOptions(role,value="",includeBlank=false){
    const employees=(state.bootstrap?.employees||[]).filter(x=>!role||x.role===role);
    const names=[...new Set(employees.map(x=>x.name).filter(Boolean))];
    if(value&&!names.includes(value)) names.unshift(value);
    return `${includeBlank?'<option value="">Не назначен</option>':""}${names.map(name=>`<option value="${esc(name)}" ${name===value?"selected":""}>${esc(name)}</option>`).join("")}`;
  }
  function populateStaticSelects(){
    const services=state.bootstrap?.services||[];
    const serviceOptions=services.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
    $("repairService").innerHTML=serviceOptions;
    $("saleService").innerHTML=serviceOptions;
    $("repairServiceFilter").innerHTML='<option value="">Все точки</option>'+serviceOptions;
    $("repairMaster").innerHTML=employeeOptions("master","",true);
    const actor=actorName();
    $("repairManager").innerHTML=employeeOptions("manager",actor,false);
    $("saleManager").innerHTML=employeeOptions("manager",actor,false);
    if(services.length){ $("repairService").value=services[0]; $("saleService").value=services[0]; }
  }

  async function bootstrap(){
    try{
      state.bootstrap=await api("bootstrap");
      updateUser(); populateStaticSelects(); showMain();
      await loadRepairs();
    }catch(e){
      if(e instanceof AuthError){
        if(crmSession()){ localStorage.removeItem(CRM_SESSION_KEY); }
        showLogin(e.message==="Нужен вход в CRM"?"":e.message);
      }else{
        showLogin(e.message||"Не удалось подключиться к CRM");
      }
    }
  }

  function switchTab(tab){
    document.querySelectorAll(".crm-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===tab));
    $("repairsPage").classList.toggle("hidden",tab!=="repairs");
    $("newRepairPage").classList.toggle("hidden",tab!=="newRepair");
    $("salesPage").classList.toggle("hidden",tab!=="sales");
    if(tab==="repairs") loadRepairs();
    if(tab==="sales") loadSales();
    if(tab==="newRepair") setTimeout(()=>$("repairPhone").focus(),30);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function repairCard(r){
    const customer=r.customer||{};
    const device=[r.device,r.model].filter(Boolean).join(" · ")||"Устройство не указано";
    const price=r.final_price!==null&&r.final_price!==undefined?r.final_price:r.estimated_price;
    return `<article class="crm-card" data-repair-id="${esc(r.id)}">
      <div class="crm-card-top">
        <div><div class="crm-order">Заказ №${esc(r.order_no)}</div><div class="crm-device">${esc(device)}</div></div>
        <span class="status-badge status-${esc(r.status)}">${esc(STATUS[r.status]||r.status)}</span>
      </div>
      <div class="crm-card-line"><strong>${esc(customer.name||"Без имени")}</strong><span>${esc(customer.phone||"")}</span><span>${esc(r.service||"")}</span></div>
      <div class="crm-card-line"><span>Мастер: <strong>${esc(r.master||"не назначен")}</strong></span><span>${esc(r.issue||"")}</span></div>
      <div class="crm-card-bottom"><span class="crm-muted">${esc(dateTime(r.accepted_at))}</span><span class="crm-price">${esc(money(price))}</span></div>
    </article>`;
  }
  async function loadRepairs(){
    const seq=++state.repairLoadSeq;
    $("repairList").innerHTML='<div class="crm-loading">Загружаем заказы…</div>';
    try{
      const data=await api("list-repairs",{q:state.repairQuery,status:state.repairStatus,service:state.repairService});
      if(seq!==state.repairLoadSeq) return;
      state.repairs=data.repairs||[];
      $("repairCount").textContent=`Заказов: ${state.repairs.length}`;
      $("repairList").innerHTML=state.repairs.length?state.repairs.map(repairCard).join(""):'<div class="crm-empty">Заказов по этому фильтру пока нет</div>';
      document.querySelectorAll("[data-repair-id]").forEach(card=>card.addEventListener("click",()=>openRepair(card.dataset.repairId)));
    }catch(e){
      if(e instanceof AuthError){showLogin("Сессия закончилась. Войдите снова.");return;}
      $("repairList").innerHTML=`<div class="crm-empty">${esc(e.message||"Не удалось загрузить заказы")}</div>`;
    }
  }

  async function submitRepair(event){
    event.preventDefault();
    const btn=$("saveRepairBtn"); $("repairFormError").textContent=""; setBusy(btn,true,"Сохраняем…");
    try{
      const data=await api("create-repair",{
        customerName:$("repairCustomerName").value,
        phone:$("repairPhone").value,
        service:$("repairService").value,
        device:$("repairDevice").value,
        model:$("repairModel").value,
        imei:$("repairImei").value,
        issue:$("repairIssue").value,
        estimatedPrice:$("repairPrice").value,
        manager:$("repairManager").value,
        master:$("repairMaster").value,
        comment:$("repairComment").value
      });
      const orderNo=data.repair?.order_no;
      $("repairForm").reset(); populateStaticSelects();
      toast(orderNo?`Заказ №${orderNo} создан`:"Заказ создан");
      switchTab("repairs");
    }catch(e){
      if(e instanceof AuthError){showLogin("Сессия закончилась. Войдите снова.");return;}
      $("repairFormError").textContent=e.message||"Не удалось создать заказ";
    }finally{setBusy(btn,false);}
  }

  function detailPair(label,value){return `<div class="detail-pair"><span>${esc(label)}</span><b>${esc(value||"—")}</b></div>`;}
  function repairDetailHtml(data){
    const r=data.repair,c=r.customer||{},history=data.history||[],past=data.customerHistory?.repairs||[],sales=data.customerHistory?.sales||[];
    const currentPrice=r.final_price!==null&&r.final_price!==undefined?r.final_price:r.estimated_price;
    return `<div class="detail-summary">
      <div class="detail-block"><h3>Клиент и устройство</h3>
        ${detailPair("Клиент",c.name||"Без имени")}${detailPair("Телефон",c.phone)}${detailPair("Устройство",[r.device,r.model].filter(Boolean).join(" · "))}${detailPair("IMEI / S/N",r.imei)}${detailPair("Неисправность",r.issue)}
      </div>
      <div class="detail-block"><h3>Заказ</h3>
        ${detailPair("Точка",r.service)}${detailPair("Менеджер",r.manager)}${detailPair("Мастер",r.master||"Не назначен")}${detailPair("Цена",money(currentPrice))}${detailPair("Принят",dateTime(r.accepted_at))}
      </div>
    </div>
    <div class="status-actions">${STATUS_ORDER.map(s=>`<button class="status-action ${r.status===s?"current":""}" data-set-status="${s}" type="button">${esc(STATUS[s])}</button>`).join("")}</div>
    <div class="detail-edit">
      <div class="form-section-title">Изменить заказ</div>
      <div class="form-grid two">
        <label><span>Тип устройства</span><input id="detailDevice" value="${esc(r.device||"")}"></label>
        <label><span>Модель</span><input id="detailModel" value="${esc(r.model||"")}"></label>
        <label><span>IMEI / серийный</span><input id="detailImei" value="${esc(r.imei||"")}"></label>
        <label><span>Предварительная цена, ₽</span><input id="detailEstimated" inputmode="decimal" value="${esc(r.estimated_price??0)}"></label>
        <label><span>Итоговая цена, ₽</span><input id="detailFinal" inputmode="decimal" value="${r.final_price===null||r.final_price===undefined?"":esc(r.final_price)}" placeholder="Пока не указана"></label>
        <label><span>Мастер</span><select id="detailMaster">${employeeOptions("master",r.master,true)}</select></label>
        <label><span>Менеджер</span><select id="detailManager">${employeeOptions("manager",r.manager,false)}</select></label>
      </div>
      <label class="form-full"><span>Неисправность</span><textarea id="detailIssue" rows="2">${esc(r.issue||"")}</textarea></label>
      <label class="form-full"><span>Комментарий</span><textarea id="detailComment" rows="2">${esc(r.comment||"")}</textarea></label>
      <div class="form-error" id="detailError"></div>
      <div class="form-actions"><button class="btn btn-primary" id="saveRepairChanges" type="button">Сохранить изменения</button></div>
    </div>
    <div class="customer-history">
      <div class="history-box"><h4>Предыдущие ремонты клиента</h4>${past.length?past.map(x=>`<div class="history-item">№${esc(x.order_no)} · ${esc([x.device,x.model].filter(Boolean).join(" "))} · ${esc(STATUS[x.status]||x.status)}</div>`).join(""):'<div class="history-item">Пока нет</div>'}</div>
      <div class="history-box"><h4>Покупки клиента</h4>${sales.length?sales.map(x=>`<div class="history-item">№${esc(x.sale_no)} · ${esc([x.device,x.model].filter(Boolean).join(" "))} · ${esc(money(x.sale_price))}</div>`).join(""):'<div class="history-item">Пока нет</div>'}</div>
    </div>
    <div class="detail-history"><h3>История статусов</h3>${history.length?history.map(h=>`<div class="history-row"><b>${esc(STATUS[h.new_status]||h.new_status)}</b> · ${esc(h.changed_by||"—")} · ${esc(dateTime(h.created_at))}</div>`).join(""):'<div class="history-row">История пока пустая</div>'}</div>`;
  }
  async function openRepair(id){
    $("repairDetailOverlay").classList.remove("hidden"); $("repairDetailBody").innerHTML='<div class="crm-loading">Загрузка…</div>';
    try{
      const data=await api("repair",{id}); state.currentRepair=data.repair;
      $("repairDetailTitle").textContent=`Заказ №${data.repair.order_no}`;
      $("repairDetailSub").textContent=`${STATUS[data.repair.status]||data.repair.status} · ${data.repair.service}`;
      $("repairDetailBody").innerHTML=repairDetailHtml(data);
      document.querySelectorAll("[data-set-status]").forEach(btn=>btn.addEventListener("click",()=>setRepairStatus(data.repair.id,btn.dataset.setStatus,btn)));
      $("saveRepairChanges").addEventListener("click",()=>saveRepairChanges(data.repair.id));
    }catch(e){
      $("repairDetailBody").innerHTML=`<div class="crm-empty">${esc(e.message||"Не удалось открыть заказ")}</div>`;
    }
  }
  async function setRepairStatus(id,status,button){
    setBusy(button,true,"…");
    try{
      await api("set-status",{id,status}); toast(`Статус: ${STATUS[status]}`); await openRepair(id); loadRepairs();
    }catch(e){toast(e.message||"Не удалось изменить статус");}
    finally{setBusy(button,false);}
  }
  async function saveRepairChanges(id){
    const btn=$("saveRepairChanges"); $("detailError").textContent=""; setBusy(btn,true,"Сохраняем…");
    try{
      await api("update-repair",{
        id,device:$("detailDevice").value,model:$("detailModel").value,imei:$("detailImei").value,
        issue:$("detailIssue").value,estimatedPrice:$("detailEstimated").value,finalPrice:$("detailFinal").value,
        master:$("detailMaster").value,manager:$("detailManager").value,comment:$("detailComment").value
      });
      toast("Заказ обновлён"); await openRepair(id); loadRepairs();
    }catch(e){$("detailError").textContent=e.message||"Не удалось сохранить";}
    finally{setBusy(btn,false);}
  }

  function saleCard(s){
    const profit=num(s.sale_price)-num(s.purchase_price),customer=s.customer||{};
    return `<article class="crm-card sale-card">
      <div class="crm-card-top"><div><div class="crm-order">Продажа №${esc(s.sale_no)}</div><div class="crm-device">${esc([s.device,s.model].filter(Boolean).join(" · "))}</div></div><div class="sale-profit ${profit<0?"negative":""}">+${esc(money(profit))}</div></div>
      <div class="crm-card-line"><strong>${esc(customer.name||"Без имени")}</strong><span>${esc(customer.phone||"")}</span><span>${esc(s.service||"")}</span></div>
      <div class="crm-card-line"><span>IMEI: ${esc(s.imei||"—")}</span><span>Менеджер: <strong>${esc(s.manager||"—")}</strong></span></div>
      <div class="crm-card-bottom"><span class="crm-muted">${esc(dateTime(s.sold_at))}</span><span class="crm-price">${esc(money(s.sale_price))}</span></div>
    </article>`;
  }
  async function loadSales(){
    const seq=++state.saleLoadSeq; $("saleList").innerHTML='<div class="crm-loading">Загружаем продажи…</div>';
    try{
      const data=await api("list-sales",{q:state.saleQuery}); if(seq!==state.saleLoadSeq)return;
      state.sales=data.sales||[]; $("saleCount").textContent=`Продаж: ${state.sales.length}`;
      $("saleList").innerHTML=state.sales.length?state.sales.map(saleCard).join(""):'<div class="crm-empty">Продаж пока нет</div>';
    }catch(e){
      if(e instanceof AuthError){showLogin("Сессия закончилась. Войдите снова.");return;}
      $("saleList").innerHTML=`<div class="crm-empty">${esc(e.message||"Не удалось загрузить продажи")}</div>`;
    }
  }
  function updateProfitPreview(){
    const purchase=Number(String($("salePurchasePrice").value||0).replace(/\s/g,"").replace(",","."))||0;
    const sale=Number(String($("salePrice").value||0).replace(/\s/g,"").replace(",","."))||0;
    const profit=sale-purchase; $("saleProfitPreview").textContent=`Прибыль: ${money(profit)}`;
  }
  function openSale(){ $("saleOverlay").classList.remove("hidden"); updateProfitPreview(); setTimeout(()=>$("salePhone").focus(),30); }
  function closeSale(){ $("saleOverlay").classList.add("hidden"); }
  async function submitSale(event){
    event.preventDefault(); const btn=$("saveSaleBtn"); $("saleFormError").textContent=""; setBusy(btn,true,"Сохраняем…");
    try{
      const data=await api("create-sale",{
        customerName:$("saleCustomerName").value,phone:$("salePhone").value,service:$("saleService").value,
        device:$("saleDevice").value,model:$("saleModel").value,imei:$("saleImei").value,
        purchasePrice:$("salePurchasePrice").value,salePrice:$("salePrice").value,manager:$("saleManager").value,comment:$("saleComment").value
      });
      $("saleForm").reset(); populateStaticSelects(); updateProfitPreview(); closeSale();
      toast(data.sale?.sale_no?`Продажа №${data.sale.sale_no} сохранена`:"Продажа сохранена"); loadSales();
    }catch(e){
      if(e instanceof AuthError){closeSale();showLogin("Сессия закончилась. Войдите снова.");return;}
      $("saleFormError").textContent=e.message||"Не удалось сохранить продажу";
    }finally{setBusy(btn,false);}
  }

  function bind(){
    document.querySelectorAll(".crm-tab").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.tab)));
    $("openNewRepairTop").addEventListener("click",()=>switchTab("newRepair"));
    $("cancelRepairForm").addEventListener("click",()=>switchTab("repairs"));
    $("repairForm").addEventListener("submit",submitRepair);
    $("crmLoginForm").addEventListener("submit",async event=>{
      event.preventDefault(); const btn=$("crmLoginBtn"); $("crmLoginError").textContent=""; setBusy(btn,true,"Входим…");
      try{
        const employee=$("crmLoginName").value.trim(),pin=$("crmLoginPin").value;
        const data=await api("login",{employee,pin}); localStorage.setItem(CRM_SESSION_KEY,data.session); localStorage.setItem(CRM_EMPLOYEE_KEY,data.employee); $("crmLoginPin").value=""; await bootstrap();
      }catch(e){$("crmLoginError").textContent=e.message||"Не удалось войти";}
      finally{setBusy(btn,false);}
    });
    $("repairSearch").addEventListener("input",event=>{clearTimeout(repairSearchTimer);repairSearchTimer=setTimeout(()=>{state.repairQuery=event.target.value.trim();loadRepairs();},300);});
    $("repairServiceFilter").addEventListener("change",event=>{state.repairService=event.target.value;loadRepairs();});
    $("repairStatusFilters").addEventListener("click",event=>{
      const btn=event.target.closest("button[data-status]");if(!btn)return;
      state.repairStatus=btn.dataset.status;document.querySelectorAll("#repairStatusFilters button").forEach(x=>x.classList.toggle("active",x===btn));loadRepairs();
    });
    $("closeRepairDetail").addEventListener("click",()=>$("repairDetailOverlay").classList.add("hidden"));
    $("repairDetailOverlay").addEventListener("click",event=>{if(event.target===$("repairDetailOverlay"))$("repairDetailOverlay").classList.add("hidden");});
    $("openSaleModal").addEventListener("click",openSale); $("closeSaleModal").addEventListener("click",closeSale); $("cancelSale").addEventListener("click",closeSale);
    $("saleOverlay").addEventListener("click",event=>{if(event.target===$("saleOverlay"))closeSale();});
    $("saleForm").addEventListener("submit",submitSale); $("salePurchasePrice").addEventListener("input",updateProfitPreview); $("salePrice").addEventListener("input",updateProfitPreview);
    $("saleSearch").addEventListener("input",event=>{clearTimeout(saleSearchTimer);saleSearchTimer=setTimeout(()=>{state.saleQuery=event.target.value.trim();loadSales();},300);});
    window.addEventListener("online",()=>{$("crmOffline").classList.add("hidden");if(!$("crmMain").classList.contains("hidden"))loadRepairs();});
    window.addEventListener("offline",()=>$("crmOffline").classList.remove("hidden"));
    if(!navigator.onLine)$("crmOffline").classList.remove("hidden");
  }

  bind();
  bootstrap();
})();
