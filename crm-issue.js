(()=>{
  "use strict";

  const API_URL="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const previousFetch=window.fetch.bind(window);
  let current=null;

  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const num=value=>{const n=Number(String(value??0).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0;};
  const money=value=>new Intl.NumberFormat("ru-RU",{minimumFractionDigits:0,maximumFractionDigits:2}).format(num(value))+" ₽";
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const adminToken=()=>readJson(ADMIN_SESSION_KEY)?.access_token||"";
  const crmSession=()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}};
  const totalOf=r=>num(r?.final_price??r?.estimated_price??0);

  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY};const a=adminToken(),s=crmSession();if(a)h.Authorization=`Bearer ${a}`;if(s)h["x-crm-session"]=s;return h;}
  function toast(message){const root=document.getElementById("crmToast");if(!root)return;root.textContent=String(message||"");root.classList.add("show");setTimeout(()=>root.classList.remove("show"),3200);}

  window.fetch=async function(input,init={}){
    const url=typeof input==="string"?input:input?.url||"";
    let body=null;
    if(url.startsWith(API_URL)&&init?.body){try{body=JSON.parse(String(init.body));}catch(_){}}
    const response=await previousFetch(input,init);
    if(response.ok&&body?.op==="repair"){
      try{const data=await response.clone().json();if(data?.repair?.id)current={repair:data.repair,paymentSummary:data.paymentSummary||null};}catch(_){ }
    }
    return response;
  };

  async function api(op,payload={}){
    const res=await previousFetch(API_URL,{method:"POST",headers:headers(),body:JSON.stringify({op,...payload}),cache:"no-store"});
    const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));
    if(!res.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${res.status}`);
    return data;
  }

  function injectStyle(){if(document.getElementById("crmIssueStyle"))return;const style=document.createElement("style");style.id="crmIssueStyle";style.textContent=`
    .issue-overlay{position:fixed;inset:0;z-index:130;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:16px}
    .issue-dialog{width:min(100%,560px);max-height:calc(100dvh - 24px);overflow:auto;background:#fff;border-radius:18px;box-shadow:0 22px 70px rgba(15,23,42,.22);padding:18px}
    .issue-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.issue-head h3{margin:0;font-size:21px;color:#172033}.issue-head p{margin:4px 0 0;color:#64748b;font-size:12px}
    .issue-close{width:42px;height:42px;border:0;border-radius:10px;background:#f1f3f6;font-size:22px;color:#344054}
    .issue-total{margin-top:14px;border:1px solid #dbe5f2;border-radius:13px;padding:12px;background:#f8fafc;display:grid;grid-template-columns:1fr auto;gap:6px 12px}.issue-total span{color:#64748b;font-size:12px}.issue-total b{text-align:right;color:#172033}.issue-total .due{font-size:17px;color:#0f5bd7}
    .issue-section{margin-top:16px}.issue-section>label,.issue-section>span{display:block;margin-bottom:7px;font-size:12px;font-weight:800;color:#475569}
    .issue-methods{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.issue-method{position:relative}.issue-method input{position:absolute;opacity:0;pointer-events:none}.issue-method span{display:grid;place-items:center;min-height:44px;border:1px solid #dbe5f2;border-radius:11px;background:#fff;font-size:12px;font-weight:800;color:#344054}.issue-method input:checked+span{background:#eaf2ff;border-color:#93b4f6;color:#0f5bd7}
    .issue-amount{width:100%;height:50px;border:1px solid #cfd8e5;border-radius:11px;padding:0 12px;font:inherit;font-size:18px;font-weight:850;color:#172033;background:#fff}
    .issue-docs{display:grid;gap:8px}.issue-doc{display:flex!important;align-items:center;gap:10px;border:1px solid #dbe5f2;border-radius:11px;padding:10px 12px;margin:0!important;background:#fff;font-size:13px!important;color:#344054!important}.issue-doc input{width:19px;height:19px;flex:0 0 auto}
    .issue-note{margin-top:8px;color:#64748b;font-size:11px;line-height:1.4}.issue-error{min-height:20px;margin-top:10px;color:#b42318;font-size:12px;font-weight:700}
    .issue-actions{display:grid;grid-template-columns:auto 1fr;gap:8px;margin-top:12px}.issue-actions button{min-height:48px;border-radius:11px;padding:10px 14px;font:inherit;font-weight:850}.issue-cancel{border:1px solid #dbe5f2;background:#fff;color:#344054}.issue-submit{border:1px solid #0f5bd7;background:#0f5bd7;color:#fff}.issue-submit:disabled{opacity:.55}
    @media(max-width:560px){.issue-overlay{align-items:flex-end;padding:8px}.issue-dialog{border-radius:18px 18px 12px 12px;padding:16px}.issue-methods{grid-template-columns:1fr 1fr}.issue-actions{grid-template-columns:1fr}.issue-cancel{order:2}}
  `;document.head.appendChild(style);}

  function closeDialog(){document.querySelector(".issue-overlay")?.remove();document.body.style.overflow="";}

  function printHtml(repair,docs,payment){
    const c=repair.customer||{};
    const device=[repair.device,repair.model].filter(Boolean).join(" · ")||"—";
    const date=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date());
    const rows=(title,subtitle)=>`<section class="doc"><header><div><b>МОБИЛЬНЫЙ АНГЕЛ</b><span>Сервисный центр</span></div><strong>${esc(title)}</strong></header><div class="meta"><span>Заказ №${esc(repair.order_no||"—")}</span><span>${esc(date)}</span></div><h1>${esc(subtitle)}</h1><table><tr><td>Клиент</td><td>${esc(c.name||"Без имени")}</td></tr><tr><td>Телефон</td><td>${esc(c.phone||"—")}</td></tr><tr><td>Устройство</td><td>${esc(device)}</td></tr><tr><td>IMEI / S/N</td><td>${esc(repair.imei||"—")}</td></tr><tr><td>Неисправность</td><td>${esc(repair.issue||"—")}</td></tr><tr><td>Мастер</td><td>${esc(repair.master||"—")}</td></tr><tr><td>Точка</td><td>${esc(repair.service||"—")}</td></tr><tr><td>Сумма заказа</td><td><b>${esc(money(totalOf(repair)))}</b></td></tr></table>${title.includes("выполненных")?`<div class="work"><b>Работы выполнены, устройство выдано клиенту.</b><p>Гарантия: ${esc(String(repair.warranty_days??14))} дней${repair.warranty_note?` · ${esc(repair.warranty_note)}`:""}.</p></div>`:`<div class="work"><b>Устройство принято на обслуживание.</b><p>Предварительная стоимость: ${esc(money(repair.estimated_price||0))}.</p></div>`}${payment?`<div class="pay">Оплата при выдаче: <b>${esc(money(payment.amount))}</b> · ${esc(({cash:"Наличные",card:"Карта",transfer:"Перевод",other:"Другое"})[payment.method]||payment.method)}</div>`:""}<div class="sign"><span>Клиент ____________________</span><span>Сервис ____________________</span></div></section>`;
    const pages=[];if(docs.act)pages.push(rows("Акт выполненных работ","Акт выполненных работ"));if(docs.receipt)pages.push(rows("Приёмная квитанция","Приёмная квитанция"));
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Документы заказа №${esc(repair.order_no||"")}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}.doc{min-height:255mm;page-break-after:always}.doc:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:10px}header div{display:grid;gap:3px}header b{font-size:18px}header span{font-size:11px;color:#555}header strong{font-size:15px}.meta{display:flex;justify-content:space-between;margin:12px 0;color:#444;font-size:12px}h1{font-size:22px;margin:16px 0}table{width:100%;border-collapse:collapse}td{border:1px solid #bbb;padding:9px 10px;font-size:12px;vertical-align:top}td:first-child{width:34%;color:#555}.work,.pay{margin-top:14px;border:1px solid #bbb;padding:12px;font-size:12px;line-height:1.45}.work p{margin:5px 0 0}.sign{display:flex;justify-content:space-between;gap:30px;margin-top:48px;font-size:12px}</style></head><body>${pages.join("")}</body></html>`;
  }

  function openPrintWindow(repair,docs,payment,win){if(!win)return false;win.document.open();win.document.write(printHtml(repair,docs,payment));win.document.close();setTimeout(()=>{try{win.focus();win.print();}catch(_){ }},300);return true;}

  function openDialog(){
    if(!current?.repair?.id){toast("Открой заказ ещё раз и нажми «Выдан»");return;}
    injectStyle();
    const repair=current.repair,summary=current.paymentSummary||{},total=totalOf(repair),paid=num(summary.paid),remaining=Math.max(0,num(summary.remaining??(total-paid)));
    closeDialog();
    const overlay=document.createElement("div");overlay.className="issue-overlay";overlay.innerHTML=`<div class="issue-dialog"><div class="issue-head"><div><h3>Оплата и выдача</h3><p>Заказ №${esc(repair.order_no||"—")} · ${esc([repair.device,repair.model].filter(Boolean).join(" ")||"Устройство")}</p></div><button class="issue-close" type="button" aria-label="Закрыть">×</button></div><div class="issue-total"><span>Сумма заказа</span><b>${esc(money(total))}</b><span>Уже оплачено</span><b>${esc(money(paid))}</b><span>К оплате сейчас</span><b class="due">${esc(money(remaining))}</b></div><form id="issueForm"><div class="issue-section"><span>Способ оплаты</span><div class="issue-methods"><label class="issue-method"><input type="radio" name="issueMethod" value="cash" checked><span>Наличные</span></label><label class="issue-method"><input type="radio" name="issueMethod" value="card"><span>Карта</span></label><label class="issue-method"><input type="radio" name="issueMethod" value="transfer"><span>Перевод</span></label><label class="issue-method"><input type="radio" name="issueMethod" value="other"><span>Другое</span></label></div></div><div class="issue-section"><label for="issueAmount">Сумма оплаты, ₽</label><input class="issue-amount" id="issueAmount" inputmode="decimal" value="${esc(String(remaining))}" ${remaining<=0.009?"readonly":""}></div><div class="issue-section"><span>Документы после оплаты</span><div class="issue-docs"><label class="issue-doc"><input id="issueDocAct" type="checkbox" checked><span>Акт выполненных работ</span></label><label class="issue-doc"><input id="issueDocReceipt" type="checkbox"><span>Приёмная квитанция</span></label></div><div class="issue-note">После успешной оплаты откроется стандартное окно печати с предпросмотром.</div></div><div class="issue-error" id="issueError"></div><div class="issue-actions"><button class="issue-cancel" type="button">Отмена</button><button class="issue-submit" type="submit">${remaining>0.009?"Оплатить и выдать":"Выдать"}</button></div></form></div>`;
    document.body.appendChild(overlay);document.body.style.overflow="hidden";
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeDialog();});overlay.querySelector(".issue-close").addEventListener("click",closeDialog);overlay.querySelector(".issue-cancel").addEventListener("click",closeDialog);
    overlay.querySelector("#issueForm").addEventListener("submit",async e=>{
      e.preventDefault();const submit=overlay.querySelector(".issue-submit"),error=overlay.querySelector("#issueError");error.textContent="";
      const amount=num(overlay.querySelector("#issueAmount").value),method=overlay.querySelector('input[name="issueMethod"]:checked')?.value||"cash",docs={act:overlay.querySelector("#issueDocAct").checked,receipt:overlay.querySelector("#issueDocReceipt").checked};
      if(amount<0){error.textContent="Проверь сумму оплаты";return;}
      let printWin=null;if(docs.act||docs.receipt){try{printWin=window.open("","_blank");}catch(_){}}
      submit.disabled=true;submit.textContent="Проводим оплату…";
      try{
        const data=await api("issue-repair",{id:repair.id,method,amount});
        const issued=data.repair||repair;current={repair:issued,paymentSummary:{paid:num(data.result?.paid_after),remaining:0,total:num(data.result?.total)}};
        closeDialog();toast(amount>0?`Оплата ${money(amount)} проведена. Заказ выдан.`:"Заказ выдан.");
        if((docs.act||docs.receipt)&&!openPrintWindow(issued,docs,{amount,method},printWin)){toast("Заказ выдан. Браузер заблокировал окно печати.");}
        setTimeout(()=>window.location.reload(),900);
      }catch(err){if(printWin&&!printWin.closed)printWin.close();error.textContent=err?.message||"Не удалось выдать заказ";submit.disabled=false;submit.textContent=remaining>0.009?"Оплатить и выдать":"Выдать";}
    });
    setTimeout(()=>overlay.querySelector("#issueAmount")?.focus(),80);
  }

  document.addEventListener("click",event=>{
    const btn=event.target instanceof Element?event.target.closest('[data-set-status="issued"]'):null;if(!btn)return;
    event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();openDialog();
  },true);
})();
