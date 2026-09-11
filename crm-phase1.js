(()=>{
  "use strict";

  const BASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const PHASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-phase1-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";

  function installSessionFetchCache(){
    if(window.__maCrmSessionCache?.installed)return;
    const upstream=window.fetch.bind(window);
    const cache=new Map(),refreshing=new Set();
    let generation=0;
    const refreshAfterMs=12000,maxEntries=140;
    const readOps={
      "ma-crm-api":new Set(["bootstrap","list-repairs","list-sales","repair"]),
      "ma-crm-phase1-api":new Set(["detail"]),
      "ma-crm-inventory-api":new Set(["bootstrap","list-products","movements","repair-options"]),
      "ma-crm-finance-api":new Set(["bootstrap","summary","transactions","debts","repair-profit","reports","unassigned-sales"]),
      "ma-crm-final-api":new Set(["bootstrap","repair-tools","compensation","payroll"])
    };
    function slugFrom(url){const m=String(url||"").match(/\/functions\/v1\/([^/?#]+)/);return m?.[1]||"";}
    function stable(value){
      if(Array.isArray(value))return value.map(stable);
      if(value&&typeof value==="object")return Object.keys(value).sort().reduce((o,k)=>(o[k]=stable(value[k]),o),{});
      return value;
    }
    function authIdentity(init){
      try{const h=new Headers(init?.headers||{});return`${h.get("authorization")||""}|${h.get("x-crm-session")||""}`;}catch(_){return"";}
    }
    function keyFor(url,init,body,slug){return`${slug}|${authIdentity(init)}|${JSON.stringify(stable(body))}`;}
    function replay(entry){return new Response(entry.text,{status:entry.status,statusText:entry.statusText,headers:entry.headers});}
    async function remember(key,slug,op,body,response,expectedGeneration){
      if(!response.ok||generation!==expectedGeneration)return;
      const clone=response.clone(),text=await clone.text();
      if(generation!==expectedGeneration)return;
      cache.set(key,{slug,op,body:stable(body),text,status:clone.status,statusText:clone.statusText,headers:[...clone.headers.entries()],at:Date.now()});
      while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
    }
    function parseEntry(entry){try{return JSON.parse(entry.text);}catch(_){return null;}}
    function saveEntry(entry,data){entry.text=JSON.stringify(data);entry.at=Date.now();}
    function dropWhere(test){for(const [key,entry] of cache)if(test(entry,key))cache.delete(key);}
    function invalidate(slugs){generation++;const wanted=new Set(slugs);dropWhere(entry=>wanted.has(entry.slug));}
    function normalizedPhone(customer){return String(customer?.phone_normalized||customer?.phone||"").replace(/\D/g,"");}
    function repairMatches(r,body={}){
      const status=String(body.status||""),service=String(body.service||""),q=String(body.q||"").trim().toLowerCase();
      if(status&&r.status!==status)return false;if(service&&r.service!==service)return false;if(!q)return true;
      const digits=q.replace(/\D/g,"");const hay=[r.order_no,r.device,r.model,r.imei,r.issue,r.manager,r.master,r.customer?.name,r.customer?.phone].join(" ").toLowerCase();
      return hay.includes(q)||!!(digits&&normalizedPhone(r.customer).includes(digits));
    }
    function saleMatches(s,body={}){
      const q=String(body.q||"").trim().toLowerCase();if(!q)return true;const digits=q.replace(/\D/g,"");const hay=[s.sale_no,s.device,s.model,s.imei,s.manager,s.customer?.name,s.customer?.phone].join(" ").toLowerCase();
      return hay.includes(q)||!!(digits&&normalizedPhone(s.customer).includes(digits));
    }
    function patchRepair(repair){
      if(!repair?.id)return;
      for(const entry of cache.values()){
        if(entry.slug!=="ma-crm-api"||entry.op!=="list-repairs")continue;
        const data=parseEntry(entry);if(!data?.repairs)continue;
        const rows=(data.repairs||[]).filter(x=>String(x.id)!==String(repair.id));
        if(repairMatches(repair,entry.body))rows.unshift(repair);
        rows.sort((a,b)=>new Date(b.updated_at||b.accepted_at||0)-new Date(a.updated_at||a.accepted_at||0));data.repairs=rows.slice(0,150);saveEntry(entry,data);
      }
      dropWhere(entry=>entry.slug==="ma-crm-api"&&entry.op==="repair"&&String(entry.body?.id||"")===String(repair.id));
    }
    function patchRepairFields(id,patch){
      if(!id)return;
      for(const entry of cache.values()){
        if(entry.slug!=="ma-crm-api"||entry.op!=="list-repairs")continue;
        const data=parseEntry(entry);if(!data?.repairs)continue;let changed=false;
        data.repairs=(data.repairs||[]).map(r=>{if(String(r.id)!==String(id))return r;changed=true;return {...r,...patch,updated_at:patch.updated_at||r.updated_at};});if(changed)saveEntry(entry,data);
      }
      dropWhere(entry=>entry.slug==="ma-crm-api"&&entry.op==="repair"&&String(entry.body?.id||"")===String(id));
    }
    function patchSale(sale){
      if(!sale?.id)return;
      for(const entry of cache.values()){
        if(entry.slug!=="ma-crm-api"||entry.op!=="list-sales")continue;
        const data=parseEntry(entry);if(!data?.sales)continue;
        const rows=(data.sales||[]).filter(x=>String(x.id)!==String(sale.id));if(saleMatches(sale,entry.body))rows.unshift(sale);
        rows.sort((a,b)=>new Date(b.sold_at||b.created_at||0)-new Date(a.sold_at||a.created_at||0));data.sales=rows.slice(0,150);saveEntry(entry,data);
      }
    }
    async function applyWriteResult(slug,op,body,response){
      if(!response.ok)return;generation++;
      const data=await response.clone().json().catch(()=>null);
      if(slug==="ma-crm-api"){
        if(op==="login"){cache.clear();return;}
        if(["create-repair","update-repair","set-status"].includes(op)&&data?.repair)patchRepair(data.repair);
        if(op==="create-sale"&&data?.sale)patchSale(data.sale);
        dropWhere(entry=>["ma-crm-phase1-api","ma-crm-final-api","ma-crm-finance-api"].includes(entry.slug));
        return;
      }
      if(slug==="ma-crm-phase1-api"){
        if(["upsert-item","delete-item"].includes(op)&&body?.repairId&&data?.finalPrice!==undefined)patchRepairFields(body.repairId,{final_price:data.finalPrice});
        dropWhere(entry=>["ma-crm-phase1-api","ma-crm-final-api","ma-crm-finance-api"].includes(entry.slug));return;
      }
      if(slug==="ma-crm-inventory-api"){
        dropWhere(entry=>["ma-crm-inventory-api","ma-crm-phase1-api","ma-crm-final-api","ma-crm-finance-api"].includes(entry.slug));return;
      }
      if(slug==="ma-crm-final-api"){
        if(op==="create-warranty"&&data?.repair)patchRepair(data.repair);
        dropWhere(entry=>["ma-crm-final-api","ma-crm-phase1-api","ma-crm-finance-api"].includes(entry.slug));return;
      }
      if(slug==="ma-crm-finance-api")dropWhere(entry=>entry.slug==="ma-crm-finance-api");
    }
    window.fetch=async function(input,init={}){
      const url=typeof input==="string"?input:input?.url||"",slug=slugFrom(url),method=String(init?.method||"GET").toUpperCase();
      if(method!=="POST"||!readOps[slug]||!init?.body)return upstream(input,init);
      let body=null;try{body=JSON.parse(String(init.body));}catch(_){return upstream(input,init);}
      const op=String(body?.op||""),isRead=readOps[slug].has(op);
      if(!isRead){const response=await upstream(input,init);await applyWriteResult(slug,op,body,response);return response;}
      const key=keyFor(url,init,body,slug),hit=cache.get(key);
      if(hit){
        if(Date.now()-hit.at>=refreshAfterMs&&!refreshing.has(key)&&navigator.onLine!==false){
          refreshing.add(key);const expectedGeneration=generation,bgInit={...init,signal:undefined,cache:"no-store"};
          upstream(input,bgInit).then(response=>remember(key,slug,op,body,response,expectedGeneration)).catch(()=>{}).finally(()=>refreshing.delete(key));
        }
        return replay(hit);
      }
      const expectedGeneration=generation,response=await upstream(input,init);await remember(key,slug,op,body,response,expectedGeneration);return response;
    };
    function clear(){generation++;cache.clear();}
    document.addEventListener("click",event=>{if(event.target.closest?.("#refreshDashboard,#financeRefresh,#inventoryRefresh,[data-crm-force-refresh]"))clear();},true);
    window.__maCrmSessionCache={installed:true,clear,stats:()=>({entries:cache.size,generation})};
  }
  installSessionFetchCache();

  const nativeFetch=window.fetch.bind(window);
  let currentRepairId="";
  let renderSeq=0;

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
  const money=value=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value))+" ₽";
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const adminToken=()=>readJson(ADMIN_SESSION_KEY)?.access_token||"";
  const crmSession=()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}};
  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY};const admin=adminToken(),staff=crmSession();if(admin)h.Authorization=`Bearer ${admin}`;if(staff)h["x-crm-session"]=staff;return h;}
  function notify(message){const root=$("crmToast");if(!root)return;root.textContent=String(message||"");root.classList.add("show");setTimeout(()=>root.classList.remove("show"),2800);}
  function localDateInputToIso(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}
  function isoToLocalInput(value){if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return"";const pad=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
  function dateTime(value){if(!value)return"Не указан";const d=new Date(value);if(Number.isNaN(d.getTime()))return"Не указан";return new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);}
  function dateOnly(value){if(!value)return"—";const d=new Date(value);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric"}).format(d);}

  async function phaseApi(op,payload={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    try{
      const res=await nativeFetch(PHASE_API,{method:"POST",headers:headers(),body:JSON.stringify({op,...payload}),signal:controller.signal,cache:"no-store"});
      const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));
      if(!res.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${res.status}`);
      return data;
    }finally{clearTimeout(timer);}
  }

  async function persistCreateExtras(repairId){
    if(!repairId)return;
    const dueAt=localDateInputToIso($("repairDueAt")?.value||"");
    const warrantyDays=Number($("repairWarrantyDays")?.value||14);
    const warrantyNote=$("repairWarrantyNote")?.value||"";
    await phaseApi("update-meta",{id:repairId,dueAt,warrantyDays:Number.isInteger(warrantyDays)?warrantyDays:14,warrantyNote});
    const amount=Number(String($("repairInitialPayment")?.value||"").replace(/\s/g,"").replace(",","."));
    if(Number.isFinite(amount)&&amount>0){
      await phaseApi("add-payment",{repairId,kind:"payment",method:$("repairInitialPaymentMethod")?.value||"cash",amount,note:"Предоплата при приёме"});
    }
  }

  async function persistUpdateExtras(repairId){
    if(!repairId)return;
    const dueAt=localDateInputToIso($("phaseDueAt")?.value||"");
    const warrantyDays=Number($("phaseWarrantyDays")?.value||14);
    const warrantyNote=$("phaseWarrantyNote")?.value||"";
    await phaseApi("update-meta",{id:repairId,dueAt,warrantyDays:Number.isInteger(warrantyDays)?warrantyDays:14,warrantyNote});
  }

  window.fetch=async function(input,init={}){
    const url=typeof input==="string"?input:input?.url||"";
    if(!url.startsWith(BASE_API)||!init?.body)return nativeFetch(input,init);
    let body=null;
    try{body=JSON.parse(String(init.body));}catch(_){return nativeFetch(input,init);}
    const response=await nativeFetch(input,init);
    if(!response.ok)return response;
    if(body?.op!=="create-repair"&&body?.op!=="update-repair")return response;
    try{
      const data=await response.clone().json();
      const repairId=data?.repair?.id||body?.id||"";
      if(body.op==="create-repair")await persistCreateExtras(repairId);
      if(body.op==="update-repair")await persistUpdateExtras(repairId);
    }catch(e){
      console.warn("MA CRM phase1 extras",e);
      setTimeout(()=>notify("Заказ сохранён, но дополнительные поля не сохранились"),50);
    }
    return response;
  };

  function injectNewRepairFields(){
    const form=$("repairForm");
    if(!form||$("phase1CreateFields"))return;
    const block=document.createElement("div");
    block.className="form-section phase1-create";
    block.id="phase1CreateFields";
    block.innerHTML=`
      <h3>Срок, гарантия и предоплата</h3>
      <div class="form-grid two">
        <label><span>Обещанный срок</span><input id="repairDueAt" type="datetime-local"></label>
        <label><span>Гарантия, дней</span><input id="repairWarrantyDays" type="number" min="0" max="730" step="1" value="14"></label>
        <label><span>Предоплата, ₽</span><input id="repairInitialPayment" inputmode="decimal" placeholder="0"></label>
        <label><span>Способ предоплаты</span><select id="repairInitialPaymentMethod"><option value="cash">Наличные</option><option value="card">Карта</option><option value="transfer">Перевод</option><option value="other">Другое</option></select></label>
      </div>
      <label class="form-full"><span>Условия гарантии</span><textarea id="repairWarrantyNote" rows="2" placeholder="Например: гарантия на установленную деталь и работу"></textarea></label>`;
    const error=$("repairFormError");
    form.insertBefore(block,error||null);
  }

  function methodLabel(method){return({cash:"Наличные",card:"Карта",transfer:"Перевод",other:"Другое"})[method]||method||"—";}
  function itemTypeLabel(type){return type==="part"?"Запчасть":"Услуга";}
  function paymentKindLabel(kind){return kind==="refund"?"Возврат":"Оплата";}
  function itemRows(items){
    if(!items.length)return'<div class="phase-empty">Позиции ещё не добавлены</div>';
    return items.map(x=>`<div class="phase-line"><div><span class="phase-tag ${x.item_type==="part"?"part":"service"}">${esc(itemTypeLabel(x.item_type))}</span><b>${esc(x.title)}</b><small>${esc(x.quantity)} × ${esc(money(x.unit_price))}${x.item_type==="part"&&num(x.unit_cost)>0?` · себестоимость ${esc(money(x.unit_cost))}`:""}</small></div><div class="phase-line-sum"><b>${esc(money(num(x.quantity)*num(x.unit_price)))}</b><button type="button" class="phase-icon-danger" data-phase-delete-item="${esc(x.id)}" aria-label="Удалить позицию">×</button></div></div>`).join("");
  }
  function paymentRows(payments){
    if(!payments.length)return'<div class="phase-empty">Платежей пока нет</div>';
    return payments.map(x=>`<div class="phase-line"><div><span class="phase-tag ${x.kind==="refund"?"refund":"payment"}">${esc(paymentKindLabel(x.kind))}</span><b>${esc(methodLabel(x.method))}</b><small>${esc(dateTime(x.created_at))}${x.note?` · ${esc(x.note)}`:""}${x.created_by?` · ${esc(x.created_by)}`:""}</small></div><div class="phase-line-sum ${x.kind==="refund"?"negative":""}"><b>${x.kind==="refund"?"−":"+"}${esc(money(x.amount))}</b></div></div>`).join("");
  }

  function phasePanelHtml(data){
    const r=data.repair||{},t=data.totals||{},items=data.items||[],payments=data.payments||[];
    const warrantyState=r.warranty_days>0?(r.warranty_until?`до ${dateOnly(r.warranty_until)}`:`${r.warranty_days} дн., начнётся после выдачи`):"Без гарантии";
    return `<div id="phase1Root" class="phase1-root">
      <div class="detail-panel phase-summary-panel">
        <div class="phase-title-row"><div><h3>Срок и гарантия</h3><p>Контроль обещанного срока и условий</p></div><span class="phase-version">Этап 1</span></div>
        <div class="edit-grid phase-meta-grid">
          <label><span>Обещанный срок</span><input id="phaseDueAt" type="datetime-local" value="${esc(isoToLocalInput(r.due_at))}"></label>
          <label><span>Гарантия, дней</span><input id="phaseWarrantyDays" type="number" min="0" max="730" step="1" value="${esc(r.warranty_days??14)}"></label>
          <label class="form-full"><span>Условия гарантии</span><textarea id="phaseWarrantyNote" rows="2" placeholder="Что входит в гарантию">${esc(r.warranty_note||"")}</textarea></label>
        </div>
        <div class="phase-inline-facts"><span><small>Срок</small><b>${esc(dateTime(r.due_at))}</b></span><span><small>Гарантия</small><b>${esc(warrantyState)}</b></span></div>
        <div class="detail-edit-actions"><button class="btn btn-secondary" id="phaseSaveMeta" type="button">Сохранить срок и гарантию</button></div>
      </div>

      <div class="detail-panel">
        <div class="phase-title-row"><div><h3>Услуги и запчасти</h3><p>Позиции автоматически формируют итоговую сумму заказа</p></div><b>${esc(money(t.itemsTotal||0))}</b></div>
        <div class="phase-lines" id="phaseItemRows">${itemRows(items)}</div>
        <form class="phase-add-form" id="phaseItemForm">
          <select id="phaseItemType"><option value="service">Услуга</option><option value="part">Запчасть</option></select>
          <input id="phaseItemTitle" required placeholder="Название услуги или запчасти">
          <input id="phaseItemQty" required inputmode="decimal" value="1" placeholder="Кол-во">
          <input id="phaseItemPrice" required inputmode="decimal" placeholder="Цена, ₽">
          <input id="phaseItemCost" inputmode="decimal" placeholder="Себест., ₽">
          <button class="btn btn-primary" type="submit">+ Добавить</button>
        </form>
      </div>

      <div class="detail-panel">
        <div class="phase-title-row"><div><h3>Оплаты</h3><p>Предоплата, доплата и возвраты по заказу</p></div></div>
        <div class="phase-money-grid">
          <span><small>Сумма заказа</small><b>${esc(money(t.orderTotal||0))}</b></span>
          <span><small>Оплачено</small><b>${esc(money(t.paid||0))}</b></span>
          <span class="${num(t.balance)>0?"attention":"ok"}"><small>Остаток</small><b>${esc(money(t.balance||0))}</b></span>
          <span><small>Себестоимость деталей</small><b>${esc(money(t.partsCost||0))}</b></span>
        </div>
        <div class="phase-lines">${paymentRows(payments)}</div>
        <form class="phase-add-form payment-form" id="phasePaymentForm">
          <select id="phasePaymentKind"><option value="payment">Оплата</option><option value="refund">Возврат</option></select>
          <select id="phasePaymentMethod"><option value="cash">Наличные</option><option value="card">Карта</option><option value="transfer">Перевод</option><option value="other">Другое</option></select>
          <input id="phasePaymentAmount" required inputmode="decimal" placeholder="Сумма, ₽">
          <input id="phasePaymentNote" placeholder="Комментарий">
          <button class="btn btn-primary" type="submit">Записать</button>
        </form>
      </div>
    </div>`;
  }

  function patchVisibleAmount(repairId,total){
    document.querySelectorAll(`[data-repair-id="${CSS.escape(String(repairId))}"]`).forEach(root=>{
      const amount=root.querySelector(".amount-cell")||root.querySelector(".mobile-row-meta b");
      if(amount)amount.textContent=money(total);
    });
    const detailFinal=$("detailFinal");if(detailFinal)detailFinal.value=String(total??"");
  }

  async function renderPhase1(repairId){
    const body=$("repairDetailBody");
    if(!body||!repairId||!body.querySelector(".order-layout"))return;
    const seq=++renderSeq;
    try{
      const data=await phaseApi("detail",{id:repairId});
      if(seq!==renderSeq||repairId!==currentRepairId)return;
      body.querySelector("#phase1Root")?.remove();
      const main=body.querySelector(".order-main")||body.querySelector(".order-layout")||body;
      const wrap=document.createElement("div");wrap.innerHTML=phasePanelHtml(data);
      main.appendChild(wrap.firstElementChild);
      bindPhase1(repairId,data);
      if((data.items||[]).length)patchVisibleAmount(repairId,data.totals?.orderTotal||0);
    }catch(e){
      console.warn("MA CRM phase1 render",e);
      if(!body.querySelector("#phase1LoadError")){
        const main=body.querySelector(".order-main")||body;
        const error=document.createElement("div");error.id="phase1LoadError";error.className="detail-panel phase-error";error.textContent="Дополнительные данные заказа временно недоступны";main.appendChild(error);
      }
    }
  }

  function bindPhase1(repairId,data){
    $("phaseSaveMeta")?.addEventListener("click",async event=>{
      const btn=event.currentTarget;btn.disabled=true;
      try{await persistUpdateExtras(repairId);notify("Срок и гарантия сохранены");await renderPhase1(repairId);}catch(e){notify(e.message||"Не удалось сохранить");}finally{btn.disabled=false;}
    });
    $("phaseItemType")?.addEventListener("change",()=>{$("phaseItemCost").disabled=$("phaseItemType").value!=="part";if($("phaseItemType").value!=="part")$("phaseItemCost").value="";});
    $("phaseItemCost") && ($("phaseItemCost").disabled=true);
    $("phaseItemForm")?.addEventListener("submit",async event=>{
      event.preventDefault();const btn=event.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
      try{
        const result=await phaseApi("upsert-item",{repairId,itemType:$("phaseItemType").value,title:$("phaseItemTitle").value,quantity:$("phaseItemQty").value,unitPrice:$("phaseItemPrice").value,unitCost:$("phaseItemCost").value||0});
        notify("Позиция добавлена");patchVisibleAmount(repairId,result.finalPrice||0);await renderPhase1(repairId);
      }catch(e){notify(e.message||"Не удалось добавить позицию");}finally{btn.disabled=false;}
    });
    document.querySelectorAll("[data-phase-delete-item]").forEach(btn=>btn.addEventListener("click",async()=>{
      if(!confirm("Удалить эту позицию из заказа?"))return;btn.disabled=true;
      try{const result=await phaseApi("delete-item",{repairId,id:btn.dataset.phaseDeleteItem});notify("Позиция удалена");if(result.finalPrice!==null)patchVisibleAmount(repairId,result.finalPrice);await renderPhase1(repairId);}catch(e){notify(e.message||"Не удалось удалить позицию");}finally{btn.disabled=false;}
    }));
    $("phasePaymentForm")?.addEventListener("submit",async event=>{
      event.preventDefault();const btn=event.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
      try{await phaseApi("add-payment",{repairId,kind:$("phasePaymentKind").value,method:$("phasePaymentMethod").value,amount:$("phasePaymentAmount").value,note:$("phasePaymentNote").value});notify($("phasePaymentKind").value==="refund"?"Возврат записан":"Оплата записана");await renderPhase1(repairId);}catch(e){notify(e.message||"Не удалось записать оплату");}finally{btn.disabled=false;}
    });
  }

  function watchRepairDetails(){
    document.addEventListener("click",event=>{
      const row=event.target.closest?.("[data-repair-id]");
      if(row?.dataset?.repairId){currentRepairId=row.dataset.repairId;setTimeout(()=>renderPhase1(currentRepairId),60);}
      if(event.target.closest?.("#closeRepairDetail")){currentRepairId="";renderSeq++;}
    },true);
    const target=$("repairDetailBody");
    if(!target)return;
    new MutationObserver(()=>{
      if(!currentRepairId)return;
      if(target.querySelector(".order-layout")&&!target.querySelector("#phase1Root"))setTimeout(()=>renderPhase1(currentRepairId),20);
    }).observe(target,{childList:true,subtree:false});
  }

  function init(){injectNewRepairFields();watchRepairDetails();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();