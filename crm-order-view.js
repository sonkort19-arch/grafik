(()=>{
  "use strict";
  if(window.MAOrderView?.version==="3")return;

  const API_URL="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-order-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const FALLBACK_STATUS={accepted:"Принят",diagnostics:"Диагностика",in_work:"В работе",waiting_part:"Ждём запчасть",ready:"Готов",issued:"Выдан"};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
  const money=value=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(value))+" ₽";
  const dateTime=value=>{if(!value)return"—";const d=new Date(value);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);};
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY},a=readJson(ADMIN_SESSION_KEY)?.access_token,s=localStorage.getItem(CRM_SESSION_KEY)||"";if(a)h.Authorization=`Bearer ${a}`;if(s)h["x-crm-session"]=s;return h;}
  function toast(message){const root=$("crmToast");if(!root)return;root.textContent=String(message||"");root.classList.add("show");setTimeout(()=>root.classList.remove("show"),2800);}
  async function api(op,payload={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{const res=await fetch(API_URL,{method:"POST",headers:headers(),body:JSON.stringify({op,...payload}),signal:controller.signal,cache:"no-store"});const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));if(!res.ok||data?.ok===false){const error=new Error(data?.error||`Ошибка ${res.status}`);error.status=res.status;throw error;}return data;}catch(e){if(e?.name==="AbortError")throw new Error("Сервер долго не отвечает. Проверь интернет.");throw e;}finally{clearTimeout(timer);}}

  function optionSnapshot(sourceId,value,includeBlank=false){const source=$(sourceId),values=[];if(source){for(const opt of source.options){const v=String(opt.value||"").trim();if(v&&!values.includes(v))values.push(v);}}if(value&&!values.includes(value))values.unshift(value);return`${includeBlank?'<option value="">Не назначен</option>':""}${values.map(v=>`<option value="${esc(v)}" ${v===value?"selected":""}>${esc(v)}</option>`).join("")}`;}
  function detailItem(label,value,full=false){return`<div class="detail-item ${full?"full":""}"><span>${esc(label)}</span><b>${esc(value||"—")}</b></div>`;}
  function currentTotal(data){const r=data?.repair||{},summary=data?.paymentSummary||{};return num(summary.total??r.final_price??r.estimated_price??0);}
  function statusesOf(data){const rows=Array.isArray(data?.statuses)&&data.statuses.length?data.statuses:Object.entries(FALLBACK_STATUS).map(([code,name],index)=>({code,name,sort_order:index*10}));return [...rows].sort((a,b)=>num(a.sort_order)-num(b.sort_order));}
  function statusName(data,code){return statusesOf(data).find(x=>x.code===code)?.name||FALLBACK_STATUS[code]||code||"—";}

  function html(data){
    const r=data.repair||{},c=r.customer||{},history=data.history||[],past=data.customerHistory?.repairs||[],sales=data.customerHistory?.sales||[],statuses=statusesOf(data);
    return `<div class="order-layout" data-order-view-v2="1"><div class="order-main"><div class="detail-panel"><h3>Статус заказа</h3><div class="status-stepper">${statuses.map(s=>`<button class="${r.status===s.code?"current":""}" data-set-status="${esc(s.code)}" type="button">${esc(s.name)}</button>`).join("")}</div></div><div class="detail-panel"><h3>Клиент и устройство</h3><div class="detail-grid">${detailItem("Клиент",c.name||"Без имени")}${detailItem("Телефон",c.phone)}${detailItem("Устройство",[r.device,r.model].filter(Boolean).join(" · "))}${detailItem("IMEI / S/N",r.imei)}${detailItem("Неисправность",r.issue,true)}${detailItem("Комментарий",r.comment,true)}</div></div><div class="detail-panel"><h3>Редактирование</h3><div class="edit-grid"><label><span>Тип устройства</span><input id="detailDevice" value="${esc(r.device||"")}"></label><label><span>Модель</span><input id="detailModel" value="${esc(r.model||"")}"></label><label><span>IMEI / серийный</span><input id="detailImei" value="${esc(r.imei||"")}"></label><label><span>Предварительная цена, ₽</span><input id="detailEstimated" inputmode="decimal" value="${esc(r.estimated_price??0)}"></label><label><span>Итог заказа</span><input id="detailFinal" value="${esc(money(currentTotal(data)))}" readonly aria-readonly="true"><small>Формируется автоматически из товаров и услуг</small></label><label><span>Мастер</span><select id="detailMaster">${optionSnapshot("repairMaster",r.master,true)}</select></label><label><span>Менеджер</span><select id="detailManager">${optionSnapshot("repairManager",r.manager,false)}</select></label><label><span>Неисправность</span><textarea id="detailIssue" rows="2">${esc(r.issue||"")}</textarea></label><label class="form-full"><span>Комментарий</span><textarea id="detailComment" rows="2">${esc(r.comment||"")}</textarea></label></div><div class="form-error" id="detailError"></div><div class="detail-edit-actions"><button class="btn btn-primary" id="saveRepairChanges" type="button">Сохранить изменения</button></div></div></div><div class="order-side"><div class="detail-panel"><h3>Заказ</h3><div class="detail-grid">${detailItem("Точка",r.service)}${detailItem("Менеджер",r.manager)}${detailItem("Мастер",r.master||"Не назначен")}${detailItem("Сумма",money(currentTotal(data)))}${detailItem("Принят",dateTime(r.accepted_at))}${detailItem("Обновлён",dateTime(r.updated_at))}</div></div><div class="detail-panel"><h3>История клиента</h3><div class="history-mini">${past.length?past.slice(0,6).map(x=>`<div class="history-mini-row"><b>Ремонт №${esc(x.order_no)}</b>${esc([x.device,x.model].filter(Boolean).join(" "))} · ${esc(statusName(data,x.status))}</div>`).join(""):"<div class=\"history-mini-row\">Других ремонтов пока нет</div>"}${sales.length?sales.slice(0,4).map(x=>`<div class="history-mini-row"><b>Продажа №${esc(x.sale_no)}</b>${esc([x.device,x.model].filter(Boolean).join(" "))} · ${esc(money(x.sale_price))}</div>`).join(""):""}</div></div><div class="detail-panel"><h3>История статусов</h3><div class="timeline">${history.length?history.map(h=>`<div class="timeline-row"><b>${esc(statusName(data,h.new_status))}</b> · ${esc(h.changed_by||"—")}<br>${esc(dateTime(h.created_at))}</div>`).join(""):'<div class="timeline-row">История пока пустая</div>'}</div></div></div></div>`;
  }

  function backgroundRefreshLists(){const btn=$("refreshDashboard");if(btn&&!btn.disabled)setTimeout(()=>btn.click(),0);}
  async function setStatus(id,status,button){if(status==="issued")return;button.disabled=true;const old=button.textContent;button.textContent="…";try{await api("set-status",{id,status});toast(`Статус: ${statusName(window.MAOrderController?.current,status)}`);backgroundRefreshLists();await window.MAOrderController.refresh({reason:"status",keepMarkup:true});}catch(e){toast(e.message||"Не удалось изменить статус");}finally{button.disabled=false;button.textContent=old;}}
  async function save(id,button){const error=$("detailError");if(error)error.textContent="";button.disabled=true;const old=button.textContent;button.textContent="Сохраняем…";try{await api("update-order",{id,device:$("detailDevice")?.value||"",model:$("detailModel")?.value||"",imei:$("detailImei")?.value||"",issue:$("detailIssue")?.value||"",estimatedPrice:$("detailEstimated")?.value||0,master:$("detailMaster")?.value||"",manager:$("detailManager")?.value||"",comment:$("detailComment")?.value||""});toast("Заказ обновлён");backgroundRefreshLists();await window.MAOrderController.refresh({reason:"edit",keepMarkup:true});}catch(e){if(error)error.textContent=e.message||"Не удалось сохранить";}finally{button.disabled=false;button.textContent=old;}}

  function render(data){
    const r=data?.repair;if(!r?.id)return;
    const title=$("repairDetailTitle"),status=$("repairDetailStatus"),sub=$("repairDetailSub"),body=$("repairDetailBody");
    if(title)title.textContent=`Заказ №${r.order_no}`;if(status)status.textContent=statusName(data,r.status).toUpperCase();if(sub)sub.textContent=`${r.service||""} · ${[r.device,r.model].filter(Boolean).join(" ")}`;if(!body)return;
    body.innerHTML=html(data);
    body.querySelectorAll("[data-set-status]").forEach(btn=>btn.addEventListener("click",()=>setStatus(r.id,btn.dataset.setStatus,btn)));
    const saveBtn=$("saveRepairChanges");if(saveBtn)saveBtn.addEventListener("click",()=>save(r.id,saveBtn));
  }

  function interceptOpen(event){
    if(event.target.closest?.("#repairDetailOverlay"))return;
    const opener=event.target.closest?.("[data-repair-id],[data-recent-repair]");
    if(!opener)return;
    const id=opener.dataset.repairId||opener.dataset.recentRepair;
    if(!id)return;
    event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();window.MAOrderController.open(String(id));
  }
  function interceptClose(event){const close=event.target.closest?.("#closeRepairDetail"),overlay=event.target===$("repairDetailOverlay");if(!close&&!overlay)return;if($("repairDetailOverlay")?.classList.contains("hidden"))return;event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();window.MAOrderController.close();}
  function interceptEscape(event){if(event.key!=="Escape"||$("repairDetailOverlay")?.classList.contains("hidden"))return;event.preventDefault();event.stopImmediatePropagation();window.MAOrderController.close();}

  const controller=window.MAOrderController;if(!controller)return;
  controller.registerRenderer(render);
  controller.registerAuthErrorHandler(message=>{localStorage.removeItem(CRM_SESSION_KEY);controller.close();const main=$("crmMain"),login=$("loginOverlay"),error=$("crmLoginError");main?.classList.add("hidden");login?.classList.remove("hidden");if(error)error.textContent=message||"Сессия закончилась. Войдите снова.";});
  document.addEventListener("click",interceptOpen,true);document.addEventListener("click",interceptClose,true);document.addEventListener("keydown",interceptEscape,true);
  window.MAOrderView={version:"3",render};
})();
