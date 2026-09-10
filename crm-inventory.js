(()=>{
  "use strict";

  const BASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const INVENTORY_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-inventory-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const chainedFetch=window.fetch.bind(window);
  const state={products:[],movements:[],services:[],q:"",category:"",service:"",currentRepairId:"",loaded:false};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
  const money=value=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value))+" ₽";
  const qty=value=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value));
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const adminToken=()=>readJson(ADMIN_SESSION_KEY)?.access_token||"";
  const crmSession=()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}};
  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY},admin=adminToken(),staff=crmSession();if(admin)h.Authorization=`Bearer ${admin}`;if(staff)h["x-crm-session"]=staff;return h;}
  function toast(message){const root=$("crmToast");if(!root)return;root.textContent=String(message||"");root.classList.add("show");setTimeout(()=>root.classList.remove("show"),2800);}
  function dateTime(value){if(!value)return"—";const d=new Date(value);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);}
  function categoryLabel(value){return({part:"Запчасть",accessory:"Аксессуар",device:"Техника",other:"Другое"})[value]||value||"—";}
  function movementLabel(value){return({receipt:"Приход",writeoff:"Списание",transfer:"Перемещение",repair_use:"В ремонт",repair_return:"Возврат из ремонта",adjustment:"Корректировка"})[value]||value||"—";}
  function productById(id){return state.products.find(x=>x.id===id)||null;}
  function stockAt(product,service){return num((product?.stocks||[]).find(x=>x.service===service)?.quantity);}
  function totalStock(product){return (product?.stocks||[]).reduce((s,x)=>s+num(x.quantity),0);}

  async function api(op,payload={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    try{
      const res=await chainedFetch(INVENTORY_API,{method:"POST",headers:headers(),body:JSON.stringify({op,...payload}),signal:controller.signal,cache:"no-store"});
      const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));
      if(!res.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${res.status}`);
      return data;
    }catch(e){if(e?.name==="AbortError")throw new Error("Склад долго не отвечает. Проверь интернет.");throw e;}finally{clearTimeout(timer);}
  }

  window.fetch=async function(input,init={}){
    const url=typeof input==="string"?input:input?.url||"";
    if(url.startsWith(BASE_API)&&init?.body){
      try{const body=JSON.parse(String(init.body));if(body?.op==="repair"&&body?.id)state.currentRepairId=String(body.id);}catch(_){ }
    }
    return chainedFetch(input,init);
  };

  function shellHtml(){return `<div class="inventory-stage">
    <div class="inventory-head"><div><h2>Склад</h2><p>Запчасти, аксессуары и остатки по точкам</p></div><div class="inventory-actions"><button class="btn btn-secondary" id="inventoryRefresh" type="button">↻ Обновить</button><button class="btn btn-primary" id="inventoryNewProduct" type="button">+ Новый товар</button></div></div>
    <div class="inventory-metrics"><div class="inventory-metric"><span>Позиций</span><b id="inventoryMetricProducts">—</b><small>активных товаров</small></div><div class="inventory-metric"><span>Всего на складе</span><b id="inventoryMetricUnits">—</b><small>единиц по всем точкам</small></div><div class="inventory-metric"><span>Низкий остаток</span><b id="inventoryMetricLow">—</b><small>ниже установленного минимума</small></div><div class="inventory-metric"><span>Стоимость остатков</span><b id="inventoryMetricValue">—</b><small>по себестоимости</small></div></div>
    <div class="inventory-toolbar"><div class="search-box"><span>⌕</span><input id="inventorySearch" type="search" autocomplete="off" placeholder="Поиск по названию или артикулу"></div><select id="inventoryCategory"><option value="">Все категории</option><option value="part">Запчасти</option><option value="accessory">Аксессуары</option><option value="device">Техника</option><option value="other">Другое</option></select><select id="inventoryService"><option value="">Все точки</option></select><button class="btn btn-secondary" id="inventoryClearFilters" type="button">Сбросить</button></div>
    <div class="inventory-grid"><div class="table-card"><div class="table-headline"><div><b>Остатки</b><span id="inventoryCount">—</span></div><div class="table-hint">Приход, списание и перемещение</div></div><div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>Товар</th><th>Категория</th><th>Остатки</th><th>Себестоимость</th><th>Цена</th><th>Действия</th></tr></thead><tbody id="inventoryTableBody"><tr><td colspan="6" class="inventory-empty">Загрузка склада…</td></tr></tbody></table></div></div><aside class="inventory-history"><div class="inventory-history-head"><h3>Последние движения</h3><p>Все изменения остатков</p></div><div class="inventory-history-list" id="inventoryHistory"><div class="inventory-empty">Загрузка…</div></div></aside></div>
  </div>`;}

  function mountShell(){
    const view=$("inventoryView");if(!view)return;
    view.innerHTML=shellHtml();
    document.querySelectorAll('.nav-item[data-view="inventory"] em').forEach(x=>x.remove());
    $("inventoryRefresh")?.addEventListener("click",()=>loadInventory(true));
    $("inventoryNewProduct")?.addEventListener("click",()=>openProductDialog());
    $("inventorySearch")?.addEventListener("input",e=>{state.q=e.target.value||"";renderProducts();});
    $("inventoryCategory")?.addEventListener("change",e=>{state.category=e.target.value||"";renderProducts();});
    $("inventoryService")?.addEventListener("change",e=>{state.service=e.target.value||"";renderProducts();});
    $("inventoryClearFilters")?.addEventListener("click",()=>{state.q="";state.category="";state.service="";$("inventorySearch").value="";$("inventoryCategory").value="";$("inventoryService").value="";renderProducts();});
  }

  function serviceOptions(value=""){return state.services.map(s=>`<option value="${esc(s)}" ${s===value?"selected":""}>${esc(s)}</option>`).join("");}
  function renderMetrics(){
    const active=state.products.filter(x=>x.active),units=active.reduce((s,p)=>s+totalStock(p),0),value=active.reduce((s,p)=>s+totalStock(p)*num(p.cost_price),0);
    const low=active.filter(p=>num(p.min_stock)>0&&state.services.some(service=>stockAt(p,service)<=num(p.min_stock))).length;
    $("inventoryMetricProducts").textContent=String(active.length);$("inventoryMetricUnits").textContent=qty(units);$("inventoryMetricLow").textContent=String(low);$("inventoryMetricValue").textContent=money(value);
  }
  function filteredProducts(){const qv=state.q.trim().toLowerCase();return state.products.filter(p=>{if(qv&&!`${p.name} ${p.sku||""}`.toLowerCase().includes(qv))return false;if(state.category&&p.category!==state.category)return false;if(state.service&&stockAt(p,state.service)<=0)return false;return true;});}
  function stockPills(p){return state.services.map(service=>{const n=stockAt(p,service),low=num(p.min_stock)>0&&n<=num(p.min_stock);return`<span class="inventory-stock-pill ${low?"low":""}"><span>${esc(service)}</span><b>${esc(qty(n))}</b></span>`;}).join("")||'<span class="muted-cell">Нет точек</span>';}
  function productRow(p){return `<tr ${p.active?"":"style=\"opacity:.55\""}><td><div class="inventory-product-name"><b>${esc(p.name)}</b><small>${p.sku?`Арт. ${esc(p.sku)} · `:""}${esc(p.unit||"шт")}${p.active?"":" · выключен"}</small></div></td><td><span class="inventory-category">${esc(categoryLabel(p.category))}</span></td><td><div class="inventory-stock-pills">${stockPills(p)}</div></td><td>${esc(money(p.cost_price))}</td><td>${esc(money(p.sale_price))}</td><td><div class="inventory-row-actions"><button type="button" data-inv-action="receipt" data-product-id="${esc(p.id)}">+ Приход</button><button type="button" data-inv-action="writeoff" data-product-id="${esc(p.id)}">− Списать</button>${state.services.length>1?`<button type="button" data-inv-action="transfer" data-product-id="${esc(p.id)}">↔ Переместить</button>`:""}<button type="button" data-inv-edit="${esc(p.id)}">Изм.</button></div></td></tr>`;}
  function renderProducts(){const rows=filteredProducts();$("inventoryCount").textContent=`${rows.length} шт.`;$("inventoryTableBody").innerHTML=rows.length?rows.map(productRow).join(""):'<tr><td colspan="6" class="inventory-empty">По этому фильтру ничего нет</td></tr>';document.querySelectorAll("[data-inv-action]").forEach(btn=>btn.addEventListener("click",()=>openMovementDialog(btn.dataset.invAction,btn.dataset.productId)));document.querySelectorAll("[data-inv-edit]").forEach(btn=>btn.addEventListener("click",()=>openProductDialog(productById(btn.dataset.invEdit))));renderMetrics();}
  function movementRoute(m){if(m.movement_type==="receipt")return`→ ${m.to_service||"—"}`;if(m.movement_type==="writeoff"||m.movement_type==="repair_use")return`${m.from_service||"—"} →`;if(m.movement_type==="transfer")return`${m.from_service||"—"} → ${m.to_service||"—"}`;if(m.movement_type==="repair_return")return`→ ${m.to_service||"—"}`;return[m.from_service,m.to_service].filter(Boolean).join(" → ")||"—";}
  function renderMovements(){const root=$("inventoryHistory");if(!root)return;if(!state.movements.length){root.innerHTML='<div class="inventory-empty">Движений пока нет</div>';return;}root.innerHTML=state.movements.map(m=>`<div class="inventory-move"><div class="inventory-move-top"><b>${esc(m.product?.name||"Товар")}</b><strong>${esc(qty(m.quantity))}</strong></div><p>${esc(movementLabel(m.movement_type))} · ${esc(movementRoute(m))}${m.repair_id?" · заказ":""}</p><small>${esc(dateTime(m.created_at))}${m.created_by?` · ${esc(m.created_by)}`:""}${m.note?` · ${esc(m.note)}`:""}</small></div>`).join("");}
  async function loadInventory(showToast=false){
    if(!$("inventoryView"))return;
    try{
      const [data,moves]=await Promise.all([api("list-products"),api("movements")]);
      state.products=data.products||[];state.services=data.services||[];state.movements=moves.movements||[];state.loaded=true;
      const select=$("inventoryService");if(select){const old=select.value;select.innerHTML='<option value="">Все точки</option>'+serviceOptions(old);if(state.services.includes(old))select.value=old;}
      renderProducts();renderMovements();if(showToast)toast("Склад обновлён");
    }catch(e){const msg=esc(e.message||"Не удалось загрузить склад");if($("inventoryTableBody"))$("inventoryTableBody").innerHTML=`<tr><td colspan="6" class="inventory-empty">${msg}</td></tr>`;if($("inventoryHistory"))$("inventoryHistory").innerHTML=`<div class="inventory-empty">${msg}</div>`;}
  }

  function closeDialog(){document.querySelector(".inv-overlay")?.remove();document.body.style.overflow="";}
  function showDialog(inner){closeDialog();const overlay=document.createElement("div");overlay.className="inv-overlay";overlay.innerHTML=inner;overlay.addEventListener("click",e=>{if(e.target===overlay)closeDialog();});document.body.appendChild(overlay);document.body.style.overflow="hidden";overlay.querySelector(".inv-close")?.addEventListener("click",closeDialog);return overlay;}
  function openProductDialog(product=null){
    const editing=!!product,overlay=showDialog(`<div class="inv-dialog"><div class="inv-dialog-head"><div><h3>${editing?"Изменить товар":"Новый товар"}</h3><p>${editing?"Название, цены и минимальный остаток":"Добавьте запчасть, аксессуар или технику"}</p></div><button class="inv-close" type="button">×</button></div><form class="inv-form" id="invProductForm"><div class="inv-form-grid"><label class="full"><span>Название *</span><input id="invProductName" required value="${esc(product?.name||"")}" placeholder="Например, Дисплей iPhone 13"></label><label><span>Артикул</span><input id="invProductSku" value="${esc(product?.sku||"")}" placeholder="IP13-DISP"></label><label><span>Категория</span><select id="invProductCategory"><option value="part">Запчасть</option><option value="accessory">Аксессуар</option><option value="device">Техника</option><option value="other">Другое</option></select></label><label><span>Единица</span><input id="invProductUnit" value="${esc(product?.unit||"шт")}"></label><label><span>Себестоимость, ₽</span><input id="invProductCost" inputmode="decimal" value="${esc(product?.cost_price??0)}"></label><label><span>Цена продажи, ₽</span><input id="invProductSale" inputmode="decimal" value="${esc(product?.sale_price??0)}"></label><label><span>Минимальный остаток на точке</span><input id="invProductMin" inputmode="decimal" value="${esc(product?.min_stock??0)}"></label>${editing?'<label><span>Состояние</span><select id="invProductActive"><option value="1">Активен</option><option value="0">Выключен</option></select></label>':""}</div><div class="inv-error" id="invProductError"></div><div class="inv-form-actions"><button class="btn btn-secondary" type="button" id="invCancel">Отмена</button><button class="btn btn-primary" type="submit" id="invProductSave">${editing?"Сохранить":"Добавить товар"}</button></div></form></div>`);
    $("invProductCategory").value=product?.category||"part";if(editing)$("invProductActive").value=product.active?"1":"0";$("invCancel").addEventListener("click",closeDialog);
    $("invProductForm").addEventListener("submit",async e=>{e.preventDefault();const btn=$("invProductSave");btn.disabled=true;$("invProductError").textContent="";try{const payload={name:$("invProductName").value,sku:$("invProductSku").value,category:$("invProductCategory").value,unit:$("invProductUnit").value,costPrice:$("invProductCost").value,salePrice:$("invProductSale").value,minStock:$("invProductMin").value};if(editing){payload.id=product.id;payload.active=$("invProductActive").value==="1";await api("update-product",payload);}else await api("create-product",payload);closeDialog();toast(editing?"Товар обновлён":"Товар добавлен");await loadInventory();}catch(err){$("invProductError").textContent=err.message||"Не удалось сохранить";}finally{btn.disabled=false;}});
  }

  function openMovementDialog(action,productId){
    const product=productById(productId);if(!product)return;const title=action==="receipt"?"Приход товара":action==="writeoff"?"Списание товара":"Перемещение товара";const first=state.services[0]||"",second=state.services[1]||first;
    showDialog(`<div class="inv-dialog"><div class="inv-dialog-head"><div><h3>${title}</h3><p>${esc(product.name)}</p></div><button class="inv-close" type="button">×</button></div><form class="inv-form" id="invMoveForm"><div class="inv-form-grid">${action==="transfer"?`<label><span>Откуда</span><select id="invMoveFrom">${serviceOptions(first)}</select></label><label><span>Куда</span><select id="invMoveTo">${serviceOptions(second)}</select></label>`:`<label><span>Точка</span><select id="invMoveService">${serviceOptions(first)}</select></label>`}<label><span>Количество *</span><input id="invMoveQty" required inputmode="decimal" value="1"></label>${action==="receipt"?`<label><span>Себестоимость за единицу, ₽</span><input id="invMoveCost" inputmode="decimal" value="${esc(product.cost_price??0)}"></label>`:""}<label class="full"><span>Комментарий</span><textarea id="invMoveNote" rows="2" placeholder="Поставщик, причина списания или примечание"></textarea></label></div><div class="inv-error" id="invMoveError"></div><div class="inv-form-actions"><button class="btn btn-secondary" type="button" id="invMoveCancel">Отмена</button><button class="btn btn-primary" type="submit" id="invMoveSave">Сохранить</button></div></form></div>`);
    if(action==="transfer"&&state.services.length>1){$("invMoveFrom").value=first;$("invMoveTo").value=second;}
    $("invMoveCancel").addEventListener("click",closeDialog);$("invMoveForm").addEventListener("submit",async e=>{e.preventDefault();const btn=$("invMoveSave");btn.disabled=true;$("invMoveError").textContent="";try{const common={productId:product.id,quantity:$("invMoveQty").value,note:$("invMoveNote").value};if(action==="receipt")await api("receive",{...common,service:$("invMoveService").value,unitCost:$("invMoveCost").value});else if(action==="writeoff")await api("writeoff",{...common,service:$("invMoveService").value});else await api("transfer",{...common,fromService:$("invMoveFrom").value,toService:$("invMoveTo").value});closeDialog();toast(action==="receipt"?"Приход сохранён":action==="writeoff"?"Списание сохранено":"Перемещение сохранено");await loadInventory();}catch(err){$("invMoveError").textContent=err.message||"Не удалось выполнить операцию";}finally{btn.disabled=false;}});
  }

  async function mountRepairStock(){
    const root=$("phase1Root");if(!root||$("inventoryRepairBlock")||!state.currentRepairId)return;
    const block=document.createElement("div");block.className="detail-panel inventory-repair-block";block.id="inventoryRepairBlock";block.innerHTML='<div class="phase-title-row"><div><h3>Запчасть со склада</h3><p>При добавлении остаток спишется автоматически с точки заказа</p></div></div><div class="inventory-empty">Проверяем остатки…</div>';root.appendChild(block);
    try{
      const data=await api("repair-options",{repairId:state.currentRepairId}),products=data.products||[];
      if(!products.length){block.innerHTML='<div class="phase-title-row"><div><h3>Запчасть со склада</h3><p>На точке заказа нет доступных складских запчастей</p></div></div>';return;}
      block.innerHTML=`<div class="phase-title-row"><div><h3>Запчасть со склада</h3><p>${esc(data.repair?.service||"")} · остаток спишется автоматически</p></div></div><div class="inventory-repair-grid"><label><span>Запчасть</span><select id="repairStockProduct">${products.map(p=>`<option value="${esc(p.id)}" data-price="${esc(p.sale_price)}" data-qty="${esc(p.quantity)}">${esc(p.name)} · ${esc(qty(p.quantity))} ${esc(p.unit||"шт")}</option>`).join("")}</select></label><label><span>Кол-во</span><input id="repairStockQty" inputmode="decimal" value="1"></label><label><span>Цена клиенту, ₽</span><input id="repairStockPrice" inputmode="decimal"></label><button class="btn btn-primary" id="repairStockAdd" type="button">Добавить</button></div><div class="inventory-repair-stock" id="repairStockHint"></div>`;
      const select=$("repairStockProduct"),sync=()=>{const opt=select.selectedOptions[0];$("repairStockPrice").value=opt?.dataset.price||0;$("repairStockHint").innerHTML=`Доступно: <b>${esc(qty(opt?.dataset.qty||0))}</b>`;};select.addEventListener("change",sync);sync();$("repairStockAdd").addEventListener("click",async()=>{const btn=$("repairStockAdd");btn.disabled=true;try{await api("use-part",{repairId:state.currentRepairId,productId:select.value,quantity:$("repairStockQty").value,unitPrice:$("repairStockPrice").value});toast("Запчасть добавлена и списана со склада");const id=state.currentRepairId;const row=[...document.querySelectorAll("[data-repair-id]")].find(x=>x.dataset.repairId===id);if(row)row.click();else $("saveRepairChanges")?.click();}catch(err){toast(err.message||"Не удалось списать запчасть");}finally{btn.disabled=false;}});
    }catch(e){block.innerHTML=`<div class="phase-title-row"><div><h3>Запчасть со склада</h3><p>${esc(e.message||"Не удалось загрузить остатки")}</p></div></div>`;}
  }

  function init(){
    mountShell();
    document.addEventListener("click",e=>{const button=e.target.closest?.('[data-view="inventory"]');if(button)setTimeout(()=>loadInventory(),0);});
    const detail=$("repairDetailBody");if(detail)new MutationObserver(()=>setTimeout(mountRepairStock,0)).observe(detail,{childList:true,subtree:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();