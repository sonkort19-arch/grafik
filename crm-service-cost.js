(()=>{
  "use strict";

  const ITEM_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-item-cost-api";
  const PHASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-phase1-api";
  const BASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  let enhancing=false,lastRepairId="";

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

  function repairIdFromPage(){
    const title=$("repairDetailTitle")?.textContent||"";
    const root=$("phase1Root");
    if(root?.dataset.repairId)return root.dataset.repairId;
    return lastRepairId||"";
  }

  function rowHtml(x){const type=x.display_type||x.item_type||"service",qty=num(x.quantity),price=num(x.unit_price),cost=num(x.unit_cost),revenue=qty*price,totalCost=qty*cost,profit=revenue-totalCost;return `<div class="phase-line"><div><span class="phase-tag ${type==="part"?"part":"service"}">${type==="part"?"Запчасть":"Услуга"}</span><b>${esc(x.title)}</b><small>${esc(String(qty))} × ${esc(money(price))}${cost>0?` · <span class="service-cost">себестоимость ${esc(money(cost))}</span> · <span class="service-profit">прибыль ${esc(money(profit))}</span>`:""}</small></div><div class="phase-line-sum"><b>${esc(money(revenue))}</b><button type="button" class="phase-icon-danger" data-phase-delete-item="${esc(x.id)}" aria-label="Удалить позицию">×</button></div></div>`;}

  function applyDetail(data){
    const root=$("phase1Root");if(!root)return;
    const items=data.items||[],totals=data.totals||{};
    const rows=$("phaseItemRows");if(rows)rows.innerHTML=items.length?items.map(rowHtml).join(""):'<div class="phase-empty">Позиции ещё не добавлены</div>';
    const panel=rows?.closest(".detail-panel");const topTotal=panel?.querySelector(".phase-title-row > b");if(topTotal)topTotal.textContent=money(totals.itemsTotal||0);
    const grid=root.querySelector(".phase-money-grid");if(grid){
      const spans=[...grid.children];
      if(spans[0]?.querySelector("b"))spans[0].querySelector("b").textContent=money(totals.itemsTotal||0);
      const costSpan=spans.find(x=>/Себестоимость/.test(x.textContent||""));if(costSpan){const small=costSpan.querySelector("small"),b=costSpan.querySelector("b");if(small)small.textContent="Себестоимость";if(b)b.textContent=money(totals.cost||0);}
      let profit=grid.querySelector(".service-profit-total");if(!profit){profit=document.createElement("span");profit.className="service-profit-total";profit.innerHTML="<small>Прибыль по позициям</small><b>0 ₽</b>";grid.appendChild(profit);}profit.querySelector("b").textContent=money(totals.profit||0);
    }
    const final=$("detailFinal");if(final&&totals.finalPrice!==null&&totals.finalPrice!==undefined)final.value=String(totals.finalPrice);
  }

  function updatePreview(){const price=num($("phaseItemPrice")?.value),cost=num($("phaseItemCost")?.value),qty=Math.max(0,num($("phaseItemQty")?.value)||0),profit=(price-cost)*qty;let box=$("serviceCostPreview");if(!box){const form=$("phaseItemForm");if(!form)return;box=document.createElement("div");box.id="serviceCostPreview";box.className="service-cost-preview";form.insertAdjacentElement("afterend",box);}box.classList.toggle("negative",profit<0);box.innerHTML=`<span>Цена клиенту − себестоимость × количество</span><b>Прибыль: ${esc(money(profit))}</b>`;}

  async function refresh(repairId){if(!repairId)return;lastRepairId=repairId;try{const data=await api(ITEM_API,"detail",{repairId});applyDetail(data);await api(BASE_API,"repair",{id:repairId}).catch(()=>{});}catch(e){console.warn("MA CRM service cost detail",e);}}

  function enhance(){if(enhancing)return;const form=$("phaseItemForm"),root=$("phase1Root");if(!form||!root)return;enhancing=true;try{
    injectStyle();
    const currentId=lastRepairId||root.dataset.repairId||"";
    const type=$("phaseItemType"),title=$("phaseItemTitle"),qty=$("phaseItemQty"),price=$("phaseItemPrice"),cost=$("phaseItemCost");
    if(type){type.value=type.value||"service";}
    if(title)title.placeholder=type?.value==="part"?"Название запчасти":"Название услуги";
    if(qty)qty.placeholder="Кол-во";
    if(price)price.placeholder="Цена клиенту, ₽";
    if(cost){cost.disabled=false;cost.placeholder="Себестоимость, ₽";}
    const heading=form.closest(".detail-panel")?.querySelector(".phase-title-row p");if(heading)heading.textContent="Цена для клиента, себестоимость и прибыль по каждой позиции";
    updatePreview();
    if(currentId)refresh(currentId);
  }finally{enhancing=false;}}

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
      if($("phaseItemTitle"))$("phaseItemTitle").value="";if($("phaseItemPrice"))$("phaseItemPrice").value="";if($("phaseItemCost"))$("phaseItemCost").value="";if($("phaseItemQty"))$("phaseItemQty").value="1";
      applyDetail({items:result.items||[],totals:{...(result.totals||{}),finalPrice:result.finalPrice}});updatePreview();await api(BASE_API,"repair",{id:repairId}).catch(()=>{});
    }catch(err){toast(err?.message||"Не удалось добавить позицию");}finally{if(btn)btn.disabled=false;}
  },true);

  document.addEventListener("click",async e=>{
    const btn=e.target instanceof Element?e.target.closest("[data-phase-delete-item]"):null;if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();if(!confirm("Удалить эту позицию из заказа?"))return;
    const repairId=repairIdFromPage();if(!repairId)return;btn.disabled=true;
    try{await api(PHASE_API,"delete-item",{repairId,id:btn.dataset.phaseDeleteItem});toast("Позиция удалена");await refresh(repairId);}catch(err){toast(err?.message||"Не удалось удалить позицию");btn.disabled=false;}
  },true);

  document.addEventListener("click",e=>{const row=e.target.closest?.("[data-repair-id]");if(row?.dataset?.repairId)lastRepairId=row.dataset.repairId;},true);
  const observer=new MutationObserver(()=>{if($("phaseItemForm"))queueMicrotask(enhance);});observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(enhance,300);
})();
