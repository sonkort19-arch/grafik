(()=>{
  "use strict";

  const ITEM_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-item-cost-api";
  const PHASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-phase1-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  let lastRepairId="",scheduled=false;
  const initializedRoots=new WeakSet();

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const num=value=>{const n=Number(String(value??0).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0;};
  const money=value=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value))+" ₽";
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const adminToken=()=>readJson(ADMIN_SESSION_KEY)?.access_token||"";
  const crmSession=()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}};
  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY};const a=adminToken(),s=crmSession();if(a)h.Authorization=`Bearer ${a}`;if(s)h["x-crm-session"]=s;return h;}
  function toast(message){const root=$("crmToast");if(!root)return;root.textContent=String(message||"");root.classList.add("show");setTimeout(()=>root.classList.remove("show"),2800);}
  async function api(url,op,payload={}){const res=await fetch(url,{method:"POST",headers:headers(),body:JSON.stringify({op,...payload}),cache:"no-store"});const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));if(!res.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${res.status}`);return data;}

  function injectStyle(){if($("serviceCostStyle"))return;const style=document.createElement("style");style.id="serviceCostStyle";style.textContent=`
    .service-cost-preview{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding:10px 12px;border:1px solid #dbe5f2;border-radius:10px;background:#f8fafc;font-size:12px;color:#64748b}.service-cost-preview b{font-size:14px;color:#172033}.service-cost-preview.negative b{color:#b42318}
    .phase-line small .service-profit{color:#137333;font-weight:800}.phase-line small .service-cost{color:#667085}
    .phase-money-grid .service-profit-total b{color:#137333}
    @media(max-width:760px){.service-cost-preview{align-items:flex-start;flex-direction:column}.phase-add-form #phaseItemCost,.phase-add-form #phaseItemPrice{min-width:0}}
  `;document.head.appendChild(style);}

  function repairIdFromPage(){return lastRepairId||$("phase1Root")?.dataset?.repairId||"";}
  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}
  function setValue(el,value){const next=String(value??"");if(el&&el.value!==next)el.value=next;}

  function rowHtml(x){const type=x.display_type||x.item_type||"service",qty=num(x.quantity),price=num(x.unit_price),cost=num(x.unit_cost),revenue=qty*price,totalCost=qty*cost,profit=revenue-totalCost;return `<div class="phase-line"><div><span class="phase-tag ${type==="part"?"part":"service"}">${type==="part"?"Запчасть":"Услуга"}</span><b>${esc(x.title)}</b><small>${esc(String(qty))} × ${esc(money(price))}${cost>0?` · <span class="service-cost">себестоимость ${esc(money(cost))}</span> · <span class="service-profit">прибыль ${esc(money(profit))}</span>`:""}</small></div><div class="phase-line-sum"><b>${esc(money(revenue))}</b><button type="button" class="phase-icon-danger" data-phase-delete-item="${esc(x.id)}" aria-label="Удалить позицию">×</button></div></div>`;}

  function applyDetail(data){
    const root=$("phase1Root");if(!root)return;
    const items=data.items||[],totals=data.totals||{};
    const rows=$("phaseItemRows");
    if(rows){const html=items.length?items.map(rowHtml).join(""):'<div class="phase-empty">Позиции ещё не добавлены</div>';if(rows.innerHTML!==html)rows.innerHTML=html;}
    const panel=rows?.closest(".detail-panel"),topTotal=panel?.querySelector(".phase-title-row > b");setText(topTotal,money(totals.itemsTotal||0));
    const grid=root.querySelector(".phase-money-grid");
    if(grid){
      const spans=[...grid.children];
      setText(spans[0]?.querySelector("b"),money(totals.itemsTotal||0));
      const costSpan=spans.find(x=>/Себестоимость/.test(x.textContent||""));if(costSpan){setText(costSpan.querySelector("small"),"Себестоимость");setText(costSpan.querySelector("b"),money(totals.cost||0));}
      let profit=grid.querySelector(".service-profit-total");if(!profit){profit=document.createElement("span");profit.className="service-profit-total";profit.innerHTML="<small>Прибыль по позициям</small><b>0 ₽</b>";grid.appendChild(profit);}setText(profit.querySelector("b"),money(totals.profit||0));
    }
    const final=$("detailFinal");if(final&&totals.finalPrice!==null&&totals.finalPrice!==undefined)setValue(final,totals.finalPrice);
  }

  function updatePreview(){
    const price=num($("phaseItemPrice")?.value),cost=num($("phaseItemCost")?.value),qty=Math.max(0,num($("phaseItemQty")?.value)||0),profit=(price-cost)*qty;
    let box=$("serviceCostPreview");if(!box){const form=$("phaseItemForm");if(!form)return;box=document.createElement("div");box.id="serviceCostPreview";box.className="service-cost-preview";form.insertAdjacentElement("afterend",box);}
    const signature=`${price}|${cost}|${qty}|${profit}`;if(box.dataset.signature===signature)return;box.dataset.signature=signature;box.classList.toggle("negative",profit<0);box.innerHTML=`<span>Цена клиенту − себестоимость × количество</span><b>Прибыль: ${esc(money(profit))}</b>`;
  }

  async function refreshOnce(root,repairId){
    if(!root||!repairId||initializedRoots.has(root))return;
    initializedRoots.add(root);lastRepairId=repairId;
    try{const data=await api(ITEM_API,"detail",{repairId});if($("phase1Root")===root)applyDetail(data);}catch(e){console.warn("MA CRM service cost detail",e);}
  }

  function enhance(){
    const form=$("phaseItemForm"),root=$("phase1Root");if(!form||!root)return;
    injectStyle();
    const type=$("phaseItemType"),title=$("phaseItemTitle"),qty=$("phaseItemQty"),price=$("phaseItemPrice"),cost=$("phaseItemCost");
    if(type&&!type.value)type.value="service";
    if(title){const p=type?.value==="part"?"Название запчасти":"Название услуги";if(title.placeholder!==p)title.placeholder=p;}
    if(qty&&qty.placeholder!=="Кол-во")qty.placeholder="Кол-во";
    if(price&&price.placeholder!=="Цена клиенту, ₽")price.placeholder="Цена клиенту, ₽";
    if(cost){cost.disabled=false;if(cost.placeholder!=="Себестоимость, ₽")cost.placeholder="Себестоимость, ₽";}
    const heading=form.closest(".detail-panel")?.querySelector(".phase-title-row p");setText(heading,"Цена для клиента, себестоимость и прибыль по каждой позиции");
    updatePreview();
    const id=repairIdFromPage();if(id)refreshOnce(root,id);
  }

  function scheduleEnhance(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});}

  document.addEventListener("input",e=>{if(e.target?.matches?.("#phaseItemPrice,#phaseItemCost,#phaseItemQty"))updatePreview();},true);
  document.addEventListener("change",e=>{if(e.target?.id!=="phaseItemType")return;e.stopImmediatePropagation();const cost=$("phaseItemCost"),title=$("phaseItemTitle");if(cost)cost.disabled=false;if(title)title.placeholder=e.target.value==="part"?"Название запчасти":"Название услуги";updatePreview();},true);

  document.addEventListener("submit",async e=>{
    const form=e.target;if(!(form instanceof HTMLElement)||form.id!=="phaseItemForm")return;
    e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();
    const repairId=repairIdFromPage();if(!repairId){toast("Не удалось определить заказ. Открой его заново.");return;}
    const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
    try{
      const result=await api(ITEM_API,"upsert-item",{repairId,itemType:$("phaseItemType")?.value||"service",title:$("phaseItemTitle")?.value||"",quantity:$("phaseItemQty")?.value||1,unitPrice:$("phaseItemPrice")?.value||0,unitCost:$("phaseItemCost")?.value||0});
      toast("Позиция добавлена");
      setValue($("phaseItemTitle"),"");setValue($("phaseItemPrice"),"");setValue($("phaseItemCost"),"");setValue($("phaseItemQty"),"1");
      applyDetail({items:result.items||[],totals:{...(result.totals||{}),finalPrice:result.finalPrice}});updatePreview();
    }catch(err){toast(err?.message||"Не удалось добавить позицию");}finally{if(btn)btn.disabled=false;}
  },true);

  document.addEventListener("click",async e=>{
    const opened=e.target.closest?.("[data-repair-id],[data-recent-repair]");if(opened){const id=opened.dataset.repairId||opened.dataset.recentRepair;if(id)lastRepairId=String(id);}
    const btn=e.target instanceof Element?e.target.closest("[data-phase-delete-item]"):null;if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();if(!confirm("Удалить эту позицию из заказа?"))return;
    const repairId=repairIdFromPage();if(!repairId)return;btn.disabled=true;
    try{const result=await api(PHASE_API,"delete-item",{repairId,id:btn.dataset.phaseDeleteItem});toast("Позиция удалена");if(result?.items||result?.totals)applyDetail({items:result.items||[],totals:{...(result.totals||{}),finalPrice:result.finalPrice}});else{const data=await api(ITEM_API,"detail",{repairId});applyDetail(data);}}catch(err){toast(err?.message||"Не удалось удалить позицию");btn.disabled=false;}
  },true);

  const body=$("repairDetailBody");if(body)new MutationObserver(scheduleEnhance).observe(body,{childList:true,subtree:true});
  setTimeout(scheduleEnhance,180);
})();
