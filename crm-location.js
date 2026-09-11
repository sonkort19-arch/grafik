(()=>{
  "use strict";

  const STORAGE_KEY="ma_crm_current_service_v1";
  const BASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const STATUS={accepted:"Принят",diagnostics:"Диагностика",in_work:"В работе",waiting_part:"Ждём запчасть",ready:"Готов",issued:"Выдан"};
  const STATUS_ORDER=Object.keys(STATUS);

  let currentService="";
  let services=[];
  let mounted=false;
  let applying=false;
  let snapshot={repairs:[],sales:[],loaded:false};
  let snapshotPromise=null;
  let observer=null;
  let applyTimer=0;
  let mutationRefreshTimer=0;

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
  const money=value=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value))+" ₽";
  const shortMoney=value=>{const n=num(value);if(Math.abs(n)>=1000000)return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(n/1000000)+" млн ₽";if(Math.abs(n)>=1000)return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(n/1000)+" тыс ₽";return money(n);};
  const dateKey=value=>{const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return"";const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d),out={};parts.forEach(x=>{if(x.type!=="literal")out[x.type]=x.value;});return`${out.year}-${out.month}-${out.day}`;};
  const currentPrice=r=>r?.final_price!==null&&r?.final_price!==undefined?r.final_price:r?.estimated_price;
  const initials=name=>(String(name||"MA").trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("")||"MA").toUpperCase();
  const sameService=row=>!currentService||String(row?.service||"")===currentService;
  const parseMoney=text=>{const raw=String(text||"").replace(/[^\d,.-]/g,"").replace(/\s/g,"").replace(",",".");const n=Number(raw);return Number.isFinite(n)?n:0;};

  function readStored(){try{return localStorage.getItem(STORAGE_KEY)||"";}catch(_){return"";}}
  function persist(value){try{localStorage.setItem(STORAGE_KEY,value||"");}catch(_){ }}
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}}
  function authHeaders(){const h={"Content-Type":"application/json","apikey":API_KEY},admin=readJson(ADMIN_SESSION_KEY)?.access_token,staff=(()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}})();if(admin)h.Authorization=`Bearer ${admin}`;if(staff)h["x-crm-session"]=staff;return h;}

  async function coreApi(op,payload={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    try{
      const response=await fetch(BASE_API,{method:"POST",headers:authHeaders(),body:JSON.stringify({op,...payload}),signal:controller.signal,cache:"no-store"});
      const data=await response.json().catch(()=>({ok:false,error:"Некорректный ответ сервера"}));
      if(!response.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${response.status}`);
      return data;
    }finally{clearTimeout(timer);}
  }

  function availableServices(){
    const fromForm=[...document.querySelectorAll("#repairService option")].map(x=>String(x.value||"").trim()).filter(Boolean);
    return [...new Set(fromForm)];
  }

  function safeStoredService(){
    const saved=readStored();
    return services.includes(saved)?saved:"";
  }

  function mainReady(){
    const main=$("crmMain");
    return !!(main&&!main.classList.contains("hidden")&&availableServices().length);
  }

  function addStyles(){
    if($("crmLocationStyles"))return;
    const style=document.createElement("style");
    style.id="crmLocationStyles";
    style.textContent=`
      .crm-location-picker{display:flex;align-items:center;min-width:0}
      .crm-location-picker select{height:38px;max-width:190px;border:1px solid #d8dde6;border-radius:9px;background:#fff;padding:0 30px 0 10px;color:#20242b;font-weight:800;font-size:12px;outline:none}
      .crm-location-picker select:focus{border-color:#9bb9fa;box-shadow:0 0 0 3px rgba(36,107,253,.08)}
      .crm-location-filtered{display:none!important}
      @media(max-width:760px){
        .topbar-actions{gap:7px;min-width:0}
        .crm-location-picker select{height:36px;max-width:120px;font-size:16px;padding-left:8px;padding-right:25px}
      }
      @media(max-width:390px){
        .crm-location-picker select{max-width:105px}
      }`;
    document.head.appendChild(style);
  }

  function mountPicker(){
    const actions=document.querySelector(".topbar-actions");
    if(!actions||$("crmLocationSwitch"))throw new Error("Не удалось подготовить переключатель точки");
    addStyles();
    const wrap=document.createElement("label");
    wrap.className="crm-location-picker";
    wrap.title="Рабочая точка";
    const select=document.createElement("select");
    select.id="crmLocationSwitch";
    select.setAttribute("aria-label","Рабочая точка");
    select.innerHTML='<option value="">Все точки</option>'+services.map(service=>`<option value="${esc(service)}">${esc(service)}</option>`).join("");
    select.value=currentService;
    select.addEventListener("change",()=>setCurrentService(select.value,{source:"picker"}));
    wrap.appendChild(select);
    actions.insertBefore(wrap,actions.firstChild);
  }

  function setSelectValue(id,value,dispatch=false){
    const el=$(id);
    if(!el)return;
    const target=[...el.options].some(option=>option.value===value)?value:"";
    if(el.value===target)return;
    el.value=target;
    if(dispatch)el.dispatchEvent(new Event("change",{bubbles:true}));
  }

  function defaultCreationForms(){
    if(!currentService)return;
    setSelectValue("repairService",currentService,false);
    setSelectValue("saleService",currentService,true);
  }

  function syncNativeFilters({dispatchOrders=true}={}){
    const repairFilter=$("repairServiceFilter");
    if(repairFilter){
      const target=[...repairFilter.options].some(o=>o.value===currentService)?currentService:"";
      if(repairFilter.value!==target){
        repairFilter.value=target;
        if(dispatchOrders)repairFilter.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }
    const inventory=$("inventoryService");
    if(inventory){
      const target=[...inventory.options].some(o=>o.value===currentService)?currentService:"";
      if(inventory.value!==target){
        inventory.value=target;
        inventory.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }
  }

  function filterSalesDom(){
    if(!snapshot.loaded)return;
    const allowed=new Set(snapshot.sales.filter(sameService).map(x=>String(x.id)));
    const bySaleNo=new Set(snapshot.sales.filter(sameService).map(x=>String(x.sale_no)));
    let visible=0;
    document.querySelectorAll("#saleTableBody tr").forEach(row=>{
      if(row.querySelector(".table-empty"))return;
      const no=String(row.querySelector(".order-number")?.textContent||"").replace(/\D/g,"");
      const show=!currentService||bySaleNo.has(no)||allowed.has(String(row.dataset.saleId||""));
      row.classList.toggle("crm-location-filtered",!show);
      if(show)visible++;
    });
    let mobile=0;
    document.querySelectorAll("#saleMobileList .mobile-row-card").forEach(card=>{
      const no=String(card.querySelector(".order-number")?.textContent||"").replace(/\D/g,"");
      const show=!currentService||bySaleNo.has(no);
      card.classList.toggle("crm-location-filtered",!show);
      if(show)mobile++;
    });
    const count=$("saleCount");
    if(count)count.textContent=`${Math.max(visible,mobile)} шт.`;
  }

  function renderDashboardFromSnapshot(){
    if(!snapshot.loaded)return;
    const repairs=snapshot.repairs.filter(sameService),sales=snapshot.sales.filter(sameService),today=dateKey(new Date());
    const newToday=repairs.filter(r=>dateKey(r.accepted_at)===today).length;
    const work=repairs.filter(r=>["diagnostics","in_work","waiting_part"].includes(r.status)).length;
    const ready=repairs.filter(r=>r.status==="ready").length;
    const issuedToday=repairs.filter(r=>dateKey(r.issued_at)===today).reduce((sum,r)=>sum+num(currentPrice(r)),0);
    const salesToday=sales.filter(s=>dateKey(s.sold_at)===today).reduce((sum,s)=>sum+num(s.sale_price),0);
    if($("metricNew"))$("metricNew").textContent=String(newToday);
    if($("metricWork"))$("metricWork").textContent=String(work);
    if($("metricReady"))$("metricReady").textContent=String(ready);
    if($("metricRevenue"))$("metricRevenue").textContent=shortMoney(issuedToday+salesToday);
    if($("statusOverview"))$("statusOverview").innerHTML=STATUS_ORDER.map(status=>`<div class="status-tile"><span><i class="dot-${status}"></i>${esc(STATUS[status])}</span><b>${repairs.filter(r=>r.status===status).length}</b></div>`).join("");
    const recent=[...repairs].sort((a,b)=>new Date(b.updated_at||b.accepted_at)-new Date(a.updated_at||a.accepted_at)).slice(0,6);
    if($("recentRepairs")){
      $("recentRepairs").innerHTML=recent.length?recent.map(r=>`<button class="compact-order text-button" data-location-repair="${esc(r.id)}" data-location-order="${esc(r.order_no)}"><span><b>№${esc(r.order_no)} · ${esc([r.device,r.model].filter(Boolean).join(" ")||"Устройство")}</b><span>${esc(r.customer?.name||"Без имени")} · ${esc(r.issue||"")}</span></span><span class="status-badge status-${esc(r.status)}">${esc(STATUS[r.status]||r.status||"—")}</span></button>`).join(""):'<div class="loading-row">Заказов пока нет</div>';
    }
    if($("navOrdersCount"))$("navOrdersCount").textContent=String(repairs.filter(r=>r.status!=="issued").length);
  }

  function renderReportsFromSnapshot(){
    if(!snapshot.loaded)return;
    const repairs=snapshot.repairs.filter(sameService),sales=snapshot.sales.filter(sameService),issued=repairs.filter(r=>r.status==="issued");
    const repairTurnover=issued.reduce((sum,r)=>sum+num(currentPrice(r)),0),salesTurnover=sales.reduce((sum,x)=>sum+num(x.sale_price),0),salesProfit=sales.reduce((sum,x)=>sum+num(x.sale_price)-num(x.purchase_price),0),avg=issued.length?repairTurnover/issued.length:0;
    if($("reportSummary"))$("reportSummary").innerHTML=`<div class="report-card"><span>Оборот ремонтов</span><b>${esc(shortMoney(repairTurnover))}</b><small>по выданным заказам</small></div><div class="report-card"><span>Продажи техники</span><b>${esc(shortMoney(salesTurnover))}</b><small>оборот продаж</small></div><div class="report-card"><span>Прибыль продаж</span><b>${esc(shortMoney(salesProfit))}</b><small>продажа минус закупка</small></div><div class="report-card"><span>Средний ремонт</span><b>${esc(shortMoney(avg))}</b><small>по выданным заказам</small></div>`;
    const max=Math.max(1,...STATUS_ORDER.map(status=>repairs.filter(r=>r.status===status).length));
    if($("reportStatusBars"))$("reportStatusBars").innerHTML=STATUS_ORDER.map(status=>{const count=repairs.filter(r=>r.status===status).length,pct=Math.round(count/max*100);return`<div class="bar-row"><span>${esc(STATUS[status])}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><b>${count}</b></div>`;}).join("");
    const counts=new Map();
    repairs.forEach(r=>{const name=String(r.master||"").trim();if(name)counts.set(name,(counts.get(name)||0)+1);});
    const people=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
    if($("reportPeople"))$("reportPeople").innerHTML=people.length?people.map(([name,count])=>`<div class="person-row"><span class="person-avatar">${esc(initials(name))}</span><span><b>${esc(name)}</b><small>назначенные ремонты</small></span><strong>${count}</strong></div>`).join(""):'<div class="loading-row">Назначений пока нет</div>';
  }

  function filterInventoryDom(){
    const select=$("inventoryService");
    if(select&&select.value!==currentService&&[...select.options].some(o=>o.value===currentService))select.value=currentService;
    document.querySelectorAll(".inventory-stock-pill").forEach(pill=>{
      const service=String(pill.querySelector("span")?.textContent||"").trim();
      pill.classList.toggle("crm-location-filtered",!!currentService&&service!==currentService);
    });
    document.querySelectorAll("#inventoryHistory .inventory-move").forEach(move=>{
      const route=String(move.querySelector("p")?.textContent||"");
      move.classList.toggle("crm-location-filtered",!!currentService&&!route.includes(currentService));
    });
    const rows=[...document.querySelectorAll("#inventoryTableBody tr")].filter(row=>!row.querySelector(".inventory-empty"));
    let products=0,units=0,value=0,low=0;
    rows.forEach(row=>{
      const pills=[...row.querySelectorAll(".inventory-stock-pill")].filter(pill=>!currentService||String(pill.querySelector("span")?.textContent||"").trim()===currentService);
      const qtySum=pills.reduce((sum,pill)=>sum+parseMoney(pill.querySelector("b")?.textContent),0);
      const show=!currentService||qtySum>0;
      row.classList.toggle("crm-location-filtered",!show);
      if(!show)return;
      products++;
      units+=qtySum;
      value+=qtySum*parseMoney(row.children[3]?.textContent);
      if(pills.some(pill=>pill.classList.contains("low")))low++;
    });
    if($("inventoryMetricProducts"))$("inventoryMetricProducts").textContent=String(products);
    if($("inventoryMetricUnits"))$("inventoryMetricUnits").textContent=new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(units);
    if($("inventoryMetricLow"))$("inventoryMetricLow").textContent=String(low);
    if($("inventoryMetricValue"))$("inventoryMetricValue").textContent=money(value);
    if($("inventoryCount"))$("inventoryCount").textContent=`${products} шт.`;
  }

  function financeRowService(row,index){return String(row.children[index]?.textContent||"").trim();}
  function filterFinanceDom(){
    document.querySelectorAll("#financeCashboxes .cashbox-card").forEach(card=>{
      const service=String(card.querySelector(".cashbox-service")?.textContent||"").trim();
      card.classList.toggle("crm-location-filtered",!!currentService&&service!==currentService);
    });
    document.querySelectorAll("#financeTxBody tr").forEach(row=>{
      if(row.querySelector(".finance-empty"))return;
      row.classList.toggle("crm-location-filtered",!!currentService&&financeRowService(row,4)!==currentService);
    });
    ["financeDebtBody","financeProfitBody"].forEach(id=>document.querySelectorAll(`#${id} tr`).forEach(row=>{
      if(row.querySelector(".finance-empty"))return;
      row.classList.toggle("crm-location-filtered",!!currentService&&financeRowService(row,2)!==currentService);
    }));
    document.querySelectorAll("#financeServiceReport .finance-report-row").forEach(row=>{
      const service=String(row.querySelector("b")?.textContent||"").trim();
      row.classList.toggle("crm-location-filtered",!!currentService&&service!==currentService);
    });
    recalcFinanceMetrics();
    renderFinanceEmployees();
    filterFinanceDialog();
  }

  function recalcFinanceMetrics(){
    const cards=[...document.querySelectorAll("#financeCashboxes .cashbox-card")].filter(x=>!x.classList.contains("crm-location-filtered"));
    const cash=cards.reduce((sum,card)=>sum+parseMoney(card.querySelector(":scope > b")?.textContent),0);
    let income=0,expenses=0;
    document.querySelectorAll("#financeTxBody tr:not(.crm-location-filtered)").forEach(row=>{
      if(row.querySelector(".finance-empty"))return;
      const kind=String(row.children[1]?.textContent||"").trim(),amount=Math.abs(parseMoney(row.children[6]?.textContent));
      if(kind.includes("Доход"))income+=amount;
      if(kind.includes("Расход")||kind.includes("Возврат"))expenses+=amount;
    });
    let debt=0;
    document.querySelectorAll("#financeDebtBody tr:not(.crm-location-filtered)").forEach(row=>{if(!row.querySelector(".finance-empty")&&String(row.children[6]?.textContent||"").includes("Долг"))debt+=Math.abs(parseMoney(row.children[6]?.textContent));});
    let profit=0;
    document.querySelectorAll("#financeServiceReport .finance-report-row:not(.crm-location-filtered) strong").forEach(el=>profit+=parseMoney(el.textContent));
    if($("finMetricCash"))$("finMetricCash").textContent=money(cash);
    if($("finMetricIncome"))$("finMetricIncome").textContent=money(income);
    if($("finMetricExpense"))$("finMetricExpense").textContent=money(expenses);
    if($("finMetricDebt"))$("finMetricDebt").textContent=money(debt);
    if($("finMetricProfit")){$("finMetricProfit").textContent=money(profit);$("finMetricProfit").classList.toggle("negative",profit<0);}
  }

  function financePeriodContains(value){
    if(!value)return false;
    const d=new Date(value);if(Number.isNaN(d.getTime()))return false;
    const key=dateKey(d),from=$("financeFrom")?.value||"",to=$("financeTo")?.value||"";
    return (!from||key>=from)&&(!to||key<=to);
  }

  function renderFinanceEmployees(){
    const root=$("financeEmployeeReport");
    if(!root)return;
    const people=new Map();
    document.querySelectorAll("#financeProfitBody tr:not(.crm-location-filtered)").forEach(row=>{
      if(row.querySelector(".finance-empty"))return;
      const employee=String(row.children[3]?.textContent||"").trim();
      if(!employee||employee==="—")return;
      const key=`master:${employee}`,cur=people.get(key)||{employee,role:"Мастер",orders:0,revenue:0,profit:0};
      cur.orders++;cur.revenue+=parseMoney(row.children[4]?.textContent);cur.profit+=parseMoney(row.children[6]?.textContent);people.set(key,cur);
    });
    snapshot.sales.filter(s=>sameService(s)&&financePeriodContains(s.sold_at)).forEach(s=>{
      const employee=String(s.manager||"").trim();if(!employee)return;
      const key=`manager:${employee}`,cur=people.get(key)||{employee,role:"Менеджер",orders:0,revenue:0,profit:0};
      cur.orders++;cur.revenue+=num(s.sale_price);cur.profit+=num(s.sale_price)-num(s.purchase_price);people.set(key,cur);
    });
    const rows=[...people.values()].sort((a,b)=>b.profit-a.profit);
    root.innerHTML=rows.length?rows.map(x=>`<div class="finance-report-row"><div><b>${esc(x.employee)} <span>${esc(x.role)}</span></b><small>${x.orders} операций · оборот ${esc(money(x.revenue))}</small></div><strong class="${x.profit<0?"negative":"positive"}">${esc(money(x.profit))}</strong></div>`).join(""):'<div class="finance-empty">Нет данных</div>';
  }

  function filterFinanceDialog(){
    const selected=currentService;
    const filterBoxSelect=el=>{
      if(!el)return;
      [...el.options].forEach(option=>{
        const text=String(option.textContent||"");
        option.hidden=!!selected&&!text.startsWith(`${selected} ·`)&&!text.endsWith(`· ${selected}`);
      });
      if(selected&&el.selectedOptions[0]?.hidden){const first=[...el.options].find(o=>!o.hidden);if(first)el.value=first.value;}
    };
    ["finTxCashbox","finFromCashbox","finToCashbox","saleCashbox"].forEach(id=>filterBoxSelect($(id)));
    const service=$("finCashboxService");
    if(selected&&service&&[...service.options].some(o=>o.value===selected))service.value=selected;
  }

  function applyLocation(){
    if(!mounted||applying)return;
    applying=true;
    try{
      const picker=$("crmLocationSwitch");if(picker&&picker.value!==currentService)picker.value=currentService;
      syncNativeFilters({dispatchOrders:false});
      defaultCreationForms();
      filterSalesDom();
      renderDashboardFromSnapshot();
      renderReportsFromSnapshot();
      filterInventoryDom();
      filterFinanceDom();
      document.dispatchEvent(new CustomEvent("ma:crm-location-change",{detail:{service:currentService}}));
    }catch(error){failOpen(error);}
    finally{applying=false;}
  }

  function scheduleApply(){
    clearTimeout(applyTimer);
    applyTimer=setTimeout(()=>applyLocation(),0);
  }

  async function refreshSnapshot(force=false){
    if(snapshotPromise&&!force)return snapshotPromise;
    snapshotPromise=(async()=>{
      try{
        const [repairs,sales]=await Promise.all([coreApi("list-repairs",{q:"",status:"",service:""}),coreApi("list-sales",{q:""})]);
        snapshot={repairs:repairs.repairs||[],sales:sales.sales||[],loaded:true};
        scheduleApply();
        return snapshot;
      }catch(error){
        console.warn("MA CRM location snapshot",error);
        return snapshot;
      }finally{snapshotPromise=null;}
    })();
    return snapshotPromise;
  }

  function setCurrentService(value,{source="api"}={}){
    try{
      const next=services.includes(value)?value:"";
      if(next===currentService){defaultCreationForms();return;}
      currentService=next;
      persist(currentService);
      const picker=$("crmLocationSwitch");if(picker)picker.value=currentService;
      syncNativeFilters({dispatchOrders:source!=="repair-filter"});
      defaultCreationForms();
      applyLocation();
    }catch(error){failOpen(error);}
  }

  function failOpen(error){
    console.warn("MA CRM location switcher",error);
    currentService="";
    persist("");
    const picker=$("crmLocationSwitch");if(picker)picker.value="";
    document.querySelectorAll(".crm-location-filtered").forEach(el=>el.classList.remove("crm-location-filtered"));
    try{
      const repairFilter=$("repairServiceFilter");
      if(repairFilter&&repairFilter.value!==""){repairFilter.value="";repairFilter.dispatchEvent(new Event("change",{bubbles:true}));}
      const inventory=$("inventoryService");
      if(inventory&&inventory.value!==""){inventory.value="";inventory.dispatchEvent(new Event("change",{bubbles:true}));}
    }catch(syncError){console.warn("MA CRM location fail-open sync",syncError);}
  }

  function bindEvents(){
    document.addEventListener("change",event=>{
      if(applying)return;
      if(event.target?.id==="repairServiceFilter")setCurrentService(event.target.value,{source:"repair-filter"});
      if(event.target?.id==="inventoryService")setCurrentService(event.target.value,{source:"inventory-filter"});
    },true);
    document.addEventListener("click",event=>{
      const trigger=event.target.closest?.("#globalNewRepair,#mobileNewRepair,#openSaleModal");
      if(trigger)setTimeout(defaultCreationForms,0);
      const recent=event.target.closest?.("[data-location-repair]");
      if(recent){
        const id=recent.dataset.locationRepair,order=recent.dataset.locationOrder||"";
        document.querySelector('[data-view="orders"]')?.click();
        const search=$("repairSearch");
        if(search){search.value=order;search.dispatchEvent(new Event("input",{bubbles:true}));setTimeout(()=>[...document.querySelectorAll("[data-repair-id]")].find(node=>String(node.dataset.repairId||"")===String(id))?.click(),420);}
      }
      const nav=event.target.closest?.("[data-view]");
      if(nav?.dataset.view==="dashboard"||nav?.dataset.view==="reports")setTimeout(scheduleApply,0);
    },true);
    $("refreshDashboard")?.addEventListener("click",()=>setTimeout(()=>refreshSnapshot(true),0));
    window.addEventListener("online",()=>refreshSnapshot(true));
    const toast=$("crmToast");
    if(toast)new MutationObserver(()=>{const text=String(toast.textContent||"");if(!/создан|сохранен|сохранён|обновл|статус|продаж|оплат|возврат/i.test(text))return;clearTimeout(mutationRefreshTimer);mutationRefreshTimer=setTimeout(()=>refreshSnapshot(true),450);}).observe(toast,{childList:true,characterData:true,subtree:true});
  }

  function observeRenders(){
    observer=new MutationObserver(()=>scheduleApply());
    ["saleTableBody","saleMobileList","inventoryTableBody","inventoryHistory","financeCashboxes","financeTxBody","financeDebtBody","financeProfitBody","financeServiceReport","financeEmployeeReport","dashboardMetrics","statusOverview","recentRepairs","reportSummary","reportStatusBars","reportPeople"].forEach(id=>{
      const el=$(id);if(el)observer.observe(el,{childList:true,subtree:true});
    });
    const bodyObserver=new MutationObserver(()=>{filterFinanceDialog();const inventory=$("inventoryService");if(inventory&&currentService&&inventory.value!==currentService&&[...inventory.options].some(o=>o.value===currentService)){inventory.value=currentService;inventory.dispatchEvent(new Event("change",{bubbles:true}));}});
    bodyObserver.observe(document.body,{childList:true,subtree:true});
  }

  function mount(){
    try{
      if(mounted||!mainReady())return false;
      services=availableServices();
      currentService=safeStoredService();
      mountPicker();
      mounted=true;
      bindEvents();
      observeRenders();
      syncNativeFilters({dispatchOrders:true});
      defaultCreationForms();
      refreshSnapshot();
      scheduleApply();
      return true;
    }catch(error){failOpen(error);return false;}
  }

  function waitForReady(){
    if(mount())return;
    const readyObserver=new MutationObserver(()=>{
      if(mount())readyObserver.disconnect();
    });
    readyObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    setTimeout(()=>readyObserver.disconnect(),30000);
  }

  window.MACrmLocation={
    getCurrentService:()=>currentService,
    setCurrentService:value=>setCurrentService(value,{source:"api"}),
    refresh:()=>refreshSnapshot(true),
    isMounted:()=>mounted
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",waitForReady,{once:true});
  else waitForReady();
})();