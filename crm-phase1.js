(()=>{
  "use strict";

  const BASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const PHASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-phase1-api";
  const ITEM_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-item-cost-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const num=value=>{const n=Number(String(value??0).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0;};
  const money=value=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value))+" ₽";
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const adminToken=()=>readJson(ADMIN_SESSION_KEY)?.access_token||"";
  const crmSession=()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}};
  let renderSeq=0,currentRepairId="";

  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY};const a=adminToken(),s=crmSession();if(a)h.Authorization=`Bearer ${a}`;if(s)h["x-crm-session"]=s;return h;}
  function toast(message){const root=$("crmToast");if(!root)return;root.textContent=String(message||"");root.classList.add("show");setTimeout(()=>root.classList.remove("show"),2800);}
  async function api(url,op,payload={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{const res=await fetch(url,{method:"POST",headers:headers(),body:JSON.stringify({op,...payload}),signal:controller.signal,cache:"no-store"});const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));if(!res.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${res.status}`);return data;}finally{clearTimeout(timer);}}
  const phaseApi=(op,payload={})=>api(PHASE_API,op,payload);
  const itemApi=(op,payload={})=>api(ITEM_API,op,payload);

  function localDateInputToIso(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}
  function isoToLocalInput(value){if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return"";const pad=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
  function dateTime(value){if(!value)return"Не указан";const d=new Date(value);if(Number.isNaN(d.getTime()))return"Не указан";return new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);}
  function dateOnly(value){if(!value)return"—";const d=new Date(value);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric"}).format(d);}
  function methodLabel(method){return({cash:"Наличные",card:"Карта",transfer:"Перевод",other:"Другое"})[method]||method||"—";}
  function typeOf(item){return item.display_type||item.item_type||"service";}

  function injectNewRepairFields(){
    const form=$("repairForm");if(!form||$("phase1CreateFields"))return;
    const block=document.createElement("div");block.className="form-section phase1-create";block.id="phase1CreateFields";
    block.innerHTML=`<h3>Срок, гарантия и предоплата</h3><div class="form-grid two"><label><span>Обещанный срок</span><input id="repairDueAt" type="datetime-local"></label><label><span>Гарантия, дней</span><input id="repairWarrantyDays" type="number" min="0" max="730" step="1" value="14"></label><label><span>Предоплата, ₽</span><input id="repairInitialPayment" inputmode="decimal" placeholder="0"></label><label><span>Способ предоплаты</span><select id="repairInitialPaymentMethod"><option value="cash">Наличные</option><option value="card">Карта</option><option value="transfer">Перевод</option><option value="other">Другое</option></select></label></div><label class="form-full"><span>Условия гарантии</span><textarea id="repairWarrantyNote" rows="2" placeholder="Например: гарантия на установленную деталь и работу"></textarea></label>`;
    form.insertBefore(block,$("repairFormError")||null);
  }

  async function persistCreateExtras(repairId){
    if(!repairId)return;
    await phaseApi("update-meta",{id:repairId,dueAt:localDateInputToIso($("repairDueAt")?.value||""),warrantyDays:Number($("repairWarrantyDays")?.value||14),warrantyNote:$("repairWarrantyNote")?.value||""});
    const amount=num($("repairInitialPayment")?.value||0);if(amount>0)await phaseApi("add-payment",{repairId,kind:"payment",method:$("repairInitialPaymentMethod")?.value||"cash",amount,note:"Предоплата при приёме"});
  }

  function installCreateUpdateBridge(){
    if(window.__maPhaseCreateBridge)return;
    const upstream=window.fetch.bind(window);
    window.fetch=async function(input,init={}){
      const url=typeof input==="string"?input:input?.url||"";let body=null;
      if(url.startsWith(BASE_API)&&init?.body){try{body=JSON.parse(String(init.body));}catch(_){}}
      const response=await upstream(input,init);
      if(response.ok&&(body?.op==="create-repair"||body?.op==="update-repair")){
        try{const data=await response.clone().json(),repairId=data?.repair?.id||body?.id||"";if(body.op==="create-repair")await persistCreateExtras(repairId);}catch(e){console.warn("MA CRM extras",e);setTimeout(()=>toast("Заказ сохранён, но дополнительные поля не сохранились"),20);}
      }
      return response;
    };
    window.__maPhaseCreateBridge=true;
  }

  function itemRows(items){
    if(!items.length)return'<div class="phase-empty">Позиции ещё не добавлены</div>';
    return items.map(x=>{const type=typeOf(x),qty=num(x.quantity),price=num(x.unit_price),cost=num(x.unit_cost),profit=(price-cost)*qty;return`<div class="phase-line"><div><span class="phase-tag ${type==="part"?"part":"service"}">${type==="part"?"Запчасть":"Услуга"}</span><b>${esc(x.title)}</b><small>${esc(qty)} × ${esc(money(price))}${cost>0?` · себестоимость ${esc(money(cost))} · <span class="service-profit">прибыль ${esc(money(profit))}</span>`:""}</small></div><div class="phase-line-sum"><b>${esc(money(qty*price))}</b><button type="button" class="phase-icon-danger" data-phase-delete-item="${esc(x.id)}" aria-label="Удалить позицию">×</button></div></div>`;}).join("");
  }
  function paymentRows(payments){if(!payments.length)return'<div class="phase-empty">Платежей пока нет</div>';return payments.map(x=>`<div class="phase-line"><div><span class="phase-tag ${x.kind==="refund"?"refund":"payment"}">${x.kind==="refund"?"Возврат":"Оплата"}</span><b>${esc(methodLabel(x.method))}</b><small>${esc(dateTime(x.created_at))}${x.note?` · ${esc(x.note)}`:""}${x.created_by?` · ${esc(x.created_by)}`:""}</small></div><div class="phase-line-sum ${x.kind==="refund"?"negative":""}"><b>${x.kind==="refund"?"−":"+"}${esc(money(x.amount))}</b></div></div>`).join("");}

  function totalsOf(data){
    const items=data.items||[],payments=data.payments||[];
    const itemsTotal=Math.round(items.reduce((s,x)=>s+num(x.quantity)*num(x.unit_price),0)*100)/100;
    const cost=Math.round(items.reduce((s,x)=>s+num(x.quantity)*num(x.unit_cost),0)*100)/100;
    const paid=Math.round(payments.reduce((s,x)=>s+(x.kind==="refund"?-1:1)*num(x.amount),0)*100)/100;
    const orderTotal=items.length?itemsTotal:num(data.repair?.final_price??data.repair?.estimated_price??0);
    return {itemsTotal,cost,profit:Math.round((itemsTotal-cost)*100)/100,paid,orderTotal,balance:Math.round((orderTotal-paid)*100)/100};
  }

  function panelHtml(data){
    const r=data.repair||{},items=data.items||[],payments=data.payments||[],t=totalsOf(data),warrantyState=r.warranty_days>0?(r.warranty_until?`до ${dateOnly(r.warranty_until)}`:`${r.warranty_days} дн., начнётся после выдачи`):"Без гарантии";
    return `<div id="phase1Root" class="phase1-root" data-repair-id="${esc(r.id||currentRepairId)}"><div class="detail-panel phase-summary-panel"><div class="phase-title-row"><div><h3>Срок и гарантия</h3><p>Контроль обещанного срока и условий</p></div></div><div class="edit-grid phase-meta-grid"><label><span>Обещанный срок</span><input id="phaseDueAt" type="datetime-local" value="${esc(isoToLocalInput(r.due_at))}"></label><label><span>Гарантия, дней</span><input id="phaseWarrantyDays" type="number" min="0" max="730" step="1" value="${esc(r.warranty_days??14)}"></label><label class="form-full"><span>Условия гарантии</span><textarea id="phaseWarrantyNote" rows="2">${esc(r.warranty_note||"")}</textarea></label></div><div class="phase-inline-facts"><span><small>Срок</small><b>${esc(dateTime(r.due_at))}</b></span><span><small>Гарантия</small><b>${esc(warrantyState)}</b></span></div><div class="detail-edit-actions"><button class="btn btn-secondary" id="phaseSaveMeta" type="button">Сохранить срок и гарантию</button></div></div><div class="detail-panel"><div class="phase-title-row"><div><h3>Услуги и запчасти</h3><p>Цена для клиента, себестоимость и прибыль</p></div><b>${esc(money(t.itemsTotal))}</b></div><div class="phase-lines" id="phaseItemRows">${itemRows(items)}</div><form class="phase-add-form" id="phaseItemForm"><select id="phaseItemType"><option value="service">Услуга</option><option value="part">Запчасть</option></select><input id="phaseItemTitle" required placeholder="Название услуги или запчасти"><input id="phaseItemQty" required inputmode="decimal" value="1" placeholder="Кол-во"><input id="phaseItemPrice" required inputmode="decimal" placeholder="Цена клиенту, ₽"><input id="phaseItemCost" inputmode="decimal" placeholder="Себестоимость, ₽"><button class="btn btn-primary" type="submit">+ Добавить</button></form><div class="service-cost-preview" id="serviceCostPreview"><span>Цена клиенту − себестоимость × количество</span><b>Прибыль: 0 ₽</b></div><div class="phase-money-grid"><span><small>Сумма позиций</small><b>${esc(money(t.itemsTotal))}</b></span><span><small>Себестоимость</small><b>${esc(money(t.cost))}</b></span><span class="service-profit-total"><small>Прибыль по позициям</small><b>${esc(money(t.profit))}</b></span></div></div><div class="detail-panel"><div class="phase-title-row"><div><h3>Оплаты</h3><p>Предоплата, доплата и возвраты</p></div></div><div class="phase-money-grid"><span><small>Сумма заказа</small><b>${esc(money(t.orderTotal))}</b></span><span><small>Оплачено</small><b>${esc(money(t.paid))}</b></span><span class="${t.balance>0?"attention":"ok"}"><small>Остаток</small><b>${esc(money(t.balance))}</b></span></div><div class="phase-lines">${paymentRows(payments)}</div><form class="phase-add-form payment-form" id="phasePaymentForm"><select id="phasePaymentKind"><option value="payment">Оплата</option><option value="refund">Возврат</option></select><select id="phasePaymentMethod"><option value="cash">Наличные</option><option value="card">Карта</option><option value="transfer">Перевод</option><option value="other">Другое</option></select><input id="phasePaymentAmount" required inputmode="decimal" placeholder="Сумма, ₽"><input id="phasePaymentNote" placeholder="Комментарий"><button class="btn btn-primary" type="submit">Записать</button></form></div></div>`;
  }

  function patchVisibleAmount(repairId,total){document.querySelectorAll(`[data-repair-id="${CSS.escape(String(repairId))}"]`).forEach(root=>{const amount=root.querySelector(".amount-cell")||root.querySelector(".mobile-row-meta b");if(amount)amount.textContent=money(total);});const final=$("detailFinal");if(final)final.value=String(total??"");}
  function updatePreview(){const price=num($("phaseItemPrice")?.value),cost=num($("phaseItemCost")?.value),qty=Math.max(0,num($("phaseItemQty")?.value)||0),profit=(price-cost)*qty,out=$("serviceCostPreview");if(out)out.innerHTML=`<span>Цена клиенту − себестоимость × количество</span><b>Прибыль: ${esc(money(profit))}</b>`;}

  async function render(repairId,token){
    if(!repairId)return;const seq=++renderSeq;currentRepairId=String(repairId);
    try{
      const data=await phaseApi("detail",{id:repairId});
      if(seq!==renderSeq||currentRepairId!==String(repairId))return;
      if(window.MAOrderController&&token&&window.MAOrderController.token!==token)return;
      const body=$("repairDetailBody");if(!body?.querySelector(".order-layout"))return;
      body.querySelector("#phase1Root")?.remove();
      const main=body.querySelector(".order-main")||body.querySelector(".order-layout")||body,wrap=document.createElement("div");wrap.innerHTML=panelHtml(data);main.appendChild(wrap.firstElementChild);
      bind(repairId,token);const totals=totalsOf(data);if((data.items||[]).length)patchVisibleAmount(repairId,totals.orderTotal);
      document.dispatchEvent(new CustomEvent("ma:order:phase-ready",{detail:{repairId:String(repairId),token,data,totals}}));
    }catch(e){console.warn("MA CRM order detail",e);toast(e.message||"Дополнительные данные заказа временно недоступны");}
  }

  function bind(repairId,token){
    $("phaseSaveMeta")?.addEventListener("click",async e=>{const btn=e.currentTarget;btn.disabled=true;try{await phaseApi("update-meta",{id:repairId,dueAt:localDateInputToIso($("phaseDueAt")?.value||""),warrantyDays:Number($("phaseWarrantyDays")?.value||14),warrantyNote:$("phaseWarrantyNote")?.value||""});toast("Срок и гарантия сохранены");await render(repairId,token);}catch(err){toast(err.message||"Не удалось сохранить");}finally{btn.disabled=false;}});
    $("phaseItemForm")?.addEventListener("input",updatePreview);
    $("phaseItemForm")?.addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');btn.disabled=true;try{const result=await itemApi("upsert-item",{repairId,itemType:$("phaseItemType")?.value||"service",title:$("phaseItemTitle")?.value||"",quantity:$("phaseItemQty")?.value||1,unitPrice:$("phaseItemPrice")?.value||0,unitCost:$("phaseItemCost")?.value||0});toast("Позиция добавлена");patchVisibleAmount(repairId,result.finalPrice||0);window.MAOrderController?.sectionChanged("items",{result});await render(repairId,token);}catch(err){toast(err.message||"Не удалось добавить позицию");}finally{btn.disabled=false;}});
    document.querySelectorAll("#phase1Root [data-phase-delete-item]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("Удалить эту позицию из заказа?"))return;btn.disabled=true;try{const result=await phaseApi("delete-item",{repairId,id:btn.dataset.phaseDeleteItem});toast("Позиция удалена");if(result.finalPrice!==null)patchVisibleAmount(repairId,result.finalPrice);window.MAOrderController?.sectionChanged("items",{result});await render(repairId,token);}catch(err){toast(err.message||"Не удалось удалить позицию");btn.disabled=false;}}));
    $("phasePaymentForm")?.addEventListener("submit",async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;try{const result=await phaseApi("add-payment",{repairId,kind:$("phasePaymentKind")?.value||"payment",method:$("phasePaymentMethod")?.value||"cash",amount:$("phasePaymentAmount")?.value||0,note:$("phasePaymentNote")?.value||""});toast($("phasePaymentKind")?.value==="refund"?"Возврат записан":"Оплата записана");window.MAOrderController?.sectionChanged("payments",{result});await render(repairId,token);}catch(err){toast(err.message||"Не удалось записать оплату");}finally{btn.disabled=false;}});
    updatePreview();
  }

  document.addEventListener("ma:order:ready",e=>{const id=e.detail?.repair?.id||e.detail?.repairId;if(id)render(String(id),e.detail?.token||0);});
  document.addEventListener("ma:order:closed",()=>{currentRepairId="";renderSeq++;});

  injectNewRepairFields();installCreateUpdateBridge();
  window.MAOrderPhase={render,refresh:()=>currentRepairId&&render(currentRepairId,window.MAOrderController?.token||0)};
})();
