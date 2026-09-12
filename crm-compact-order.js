(()=>{
  "use strict";

  const MOBILE="(max-width: 760px)";
  const isMobile=()=>window.matchMedia(MOBILE).matches;
  const $=id=>document.getElementById(id);

  function injectStyle(){
    if($("compactOrderStyle"))return;
    const style=document.createElement("style");
    style.id="compactOrderStyle";
    style.textContent=`
      @media(max-width:760px){
        #repairDetailOverlay{padding:0;background:#f4f6f9;align-items:stretch}
        #repairDetailOverlay .order-modal{width:100%;max-width:none;height:100dvh;max-height:none;border-radius:0;background:#fff;display:flex;flex-direction:column;overflow:hidden}
        #repairDetailOverlay .order-modal-head{position:relative;flex:0 0 auto;padding:18px 18px 12px;border-bottom:1px solid #e5eaf1;background:#fff;align-items:flex-start}
        #repairDetailOverlay .order-modal-head .drawer-kicker{font-size:11px;letter-spacing:.18em;color:#8a94a6}
        #repairDetailOverlay .order-modal-head h2{font-size:27px;line-height:1.1;margin:5px 0 0}
        #repairDetailOverlay .order-modal-head p{font-size:13px;margin:7px 0 0;color:#697386;padding-right:64px}
        #repairDetailOverlay #closeRepairDetail{width:48px;height:48px;border-radius:14px;flex:0 0 48px;font-size:25px}
        .hc-order-amount{font-size:28px;font-weight:850;letter-spacing:-.03em;color:#172033;margin-top:12px}
        #repairDetailOverlay .order-modal-body{flex:1 1 auto;overflow:auto;padding:0 0 calc(28px + env(safe-area-inset-bottom));background:#fff}
        #repairDetailOverlay .order-layout{display:block!important;padding:0!important;gap:0!important}
        #repairDetailOverlay .order-main,#repairDetailOverlay .order-side{display:contents!important}
        #repairDetailOverlay .detail-panel{border:0!important;border-radius:0!important;box-shadow:none!important;margin:0!important;padding:18px!important;border-bottom:1px solid #e9edf3!important;background:#fff!important}
        #repairDetailOverlay .detail-panel h3{font-size:18px;margin:0 0 14px}
        #repairDetailOverlay .detail-grid{gap:12px}
        #repairDetailOverlay .detail-item{padding:0!important;border:0!important;background:transparent!important}
        #repairDetailOverlay .detail-item span{font-size:12px;color:#8a94a6;margin-bottom:3px}
        #repairDetailOverlay .detail-item b{font-size:15px;line-height:1.35;color:#1f2937}
        .hc-status-panel{padding:14px 18px 16px!important}
        .hc-status-panel>h3{display:none}
        .hc-status-current{width:100%;min-height:54px;border:0;border-radius:12px;background:#2f6df6;color:#fff;font:inherit;font-size:17px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:9px}
        .hc-status-current:after{content:'⌄';font-size:18px;transition:transform .16s ease}
        .hc-status-panel.hc-status-open .hc-status-current:after{transform:rotate(180deg)}
        .hc-status-panel .status-stepper{display:none!important;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;overflow:visible!important}
        .hc-status-panel.hc-status-open .status-stepper{display:grid!important}
        .hc-status-panel .status-stepper button{min-width:0!important;min-height:44px!important;border-radius:10px!important;font-size:13px!important;padding:8px!important}
        .hc-status-panel .status-stepper button.current{background:#eaf1ff!important;color:#245fd6!important;border-color:#9fbcff!important}
        .hc-tabs{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:1.2fr 1fr 1fr;background:#fff;border-bottom:1px solid #e5eaf1;padding:0 14px}
        .hc-tabs button{border:0;background:transparent;padding:14px 6px 12px;color:#8a94a6;font:inherit;font-size:12px;font-weight:850;white-space:nowrap;border-bottom:3px solid transparent}
        .hc-tabs button.active{color:#172033;border-bottom-color:#2f6df6}
        .hc-panel-hidden{display:none!important}
        .hc-info-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .hc-info-head h3{margin:0!important}
        .hc-edit-toggle{border:1px solid #dce3ec;background:#fff;color:#2f6df6;border-radius:10px;padding:8px 11px;font:inherit;font-size:12px;font-weight:850}
        .hc-edit-panel{display:none}
        .hc-edit-panel.hc-edit-open{display:block}
        .hc-edit-panel .edit-grid{grid-template-columns:1fr!important;gap:11px!important}
        .hc-edit-panel input,.hc-edit-panel select,.hc-edit-panel textarea{min-height:44px!important;font-size:16px!important}
        .hc-edit-panel .detail-edit-actions{position:sticky;bottom:0;background:#fff;padding-top:10px}
        .hc-order-meta,.hc-history-panel{display:none}
        #phase1Root{display:contents!important}
        #phase1Root>.detail-panel{padding:18px!important}
        #phase1Root .phase-title-row{align-items:flex-start}
        #phase1Root .phase-title-row h3{font-size:18px!important}
        #phase1Root .phase-title-row p{font-size:12px!important;line-height:1.35!important}
        #phase1Root .phase-add-form{grid-template-columns:1fr!important;gap:9px!important}
        #phase1Root .phase-add-form input,#phase1Root .phase-add-form select,#phase1Root .phase-add-form button{width:100%!important;min-height:46px!important;font-size:16px!important}
        #phase1Root .phase-line{gap:10px!important;padding:12px 0!important}
        #phase1Root .phase-line>div:first-child{min-width:0}
        #phase1Root .phase-line b{font-size:14px}
        #phase1Root .phase-line small{font-size:11px;line-height:1.45}
        #phase1Root .phase-money-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}
        #phase1Root .phase-money-grid span{padding:10px!important}
        #phase1Root .phase-meta-grid{grid-template-columns:1fr!important}
        .hc-products-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .hc-products-heading h3{margin:0!important}
        .hc-add-toggle{border:1px solid #dce3ec;background:#fff;color:#172033;border-radius:10px;padding:9px 14px;font:inherit;font-weight:850}
        .hc-items-panel .phase-add-form,.hc-items-panel #serviceCostPreview{display:none!important}
        .hc-items-panel.hc-add-open .phase-add-form{display:grid!important}
        .hc-items-panel.hc-add-open #serviceCostPreview{display:flex!important}
        .hc-warranty-panel{display:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function panelByHeading(text){
    return [...document.querySelectorAll("#repairDetailBody .detail-panel")].find(p=>String(p.querySelector("h3")?.textContent||"").trim()===text)||null;
  }

  function statusText(panel){
    const current=panel?.querySelector(".status-stepper button.current");
    return current?.textContent?.trim()||$("repairDetailStatus")?.textContent?.trim()||"Статус";
  }

  function makeTabs(){
    let tabs=$("hcOrderTabs");
    if(tabs)return tabs;
    tabs=document.createElement("div");
    tabs.id="hcOrderTabs";
    tabs.className="hc-tabs";
    tabs.innerHTML='<button type="button" class="active" data-hc-tab="general">Общая информация</button><button type="button" data-hc-tab="items">Товары и услуги</button><button type="button" data-hc-tab="payments">Платежи</button>';
    const status=panelByHeading("Статус заказа");
    if(status)status.insertAdjacentElement("afterend",tabs);
    tabs.addEventListener("click",e=>{const btn=e.target.closest("[data-hc-tab]");if(!btn)return;setTab(btn.dataset.hcTab);});
    return tabs;
  }

  function setTab(tab){
    document.querySelectorAll("#hcOrderTabs [data-hc-tab]").forEach(b=>b.classList.toggle("active",b.dataset.hcTab===tab));
    const client=panelByHeading("Клиент и устройство"),edit=panelByHeading("Редактирование"),order=panelByHeading("Заказ"),customerHistory=panelByHeading("История клиента"),statusHistory=panelByHeading("История статусов");
    const root=$("phase1Root"),phasePanels=root?[...root.children].filter(x=>x.classList?.contains("detail-panel")):[];
    const warranty=phasePanels.find(p=>p.querySelector("#phaseSaveMeta")),items=phasePanels.find(p=>p.querySelector("#phaseItemForm")),payments=phasePanels.find(p=>p.querySelector("#phasePaymentForm"));
    [client,edit,order,customerHistory,statusHistory,warranty,items,payments].forEach(p=>p?.classList.add("hc-panel-hidden"));
    if(tab==="general"){client?.classList.remove("hc-panel-hidden");edit?.classList.remove("hc-panel-hidden");warranty?.classList.remove("hc-panel-hidden");}
    if(tab==="items")items?.classList.remove("hc-panel-hidden");
    if(tab==="payments")payments?.classList.remove("hc-panel-hidden");
  }

  function compactStatus(){
    const panel=panelByHeading("Статус заказа");if(!panel)return;
    panel.classList.add("hc-status-panel");
    let current=panel.querySelector(".hc-status-current");
    if(!current){current=document.createElement("button");current.type="button";current.className="hc-status-current";panel.insertBefore(current,panel.querySelector(".status-stepper"));current.addEventListener("click",()=>panel.classList.toggle("hc-status-open"));}
    current.textContent=statusText(panel);
    panel.querySelectorAll(".status-stepper button").forEach(btn=>btn.addEventListener("click",()=>panel.classList.remove("hc-status-open"),{once:true}));
  }

  function compactHeader(){
    const head=document.querySelector("#repairDetailOverlay .order-modal-head");if(!head)return;
    let amount=head.querySelector(".hc-order-amount");if(!amount){amount=document.createElement("div");amount.className="hc-order-amount";head.querySelector("div")?.appendChild(amount);}
    const order=panelByHeading("Заказ");
    const sum=[...(order?.querySelectorAll(".detail-item")||[])].find(x=>/Сумма/i.test(x.querySelector("span")?.textContent||""));
    amount.textContent=sum?.querySelector("b")?.textContent?.trim()||$("detailFinal")?.value||"0 ₽";
  }

  function compactGeneral(){
    const client=panelByHeading("Клиент и устройство"),edit=panelByHeading("Редактирование"),order=panelByHeading("Заказ"),customerHistory=panelByHeading("История клиента"),statusHistory=panelByHeading("История статусов");
    if(client&&!client.querySelector(".hc-info-head")){
      const h=client.querySelector("h3");const wrap=document.createElement("div");wrap.className="hc-info-head";h?.replaceWith(wrap);wrap.appendChild(h);const btn=document.createElement("button");btn.type="button";btn.className="hc-edit-toggle";btn.textContent="Изменить";wrap.appendChild(btn);btn.addEventListener("click",()=>{edit?.classList.toggle("hc-edit-open");btn.textContent=edit?.classList.contains("hc-edit-open")?"Скрыть":"Изменить";});
    }
    edit?.classList.add("hc-edit-panel");
    order?.classList.add("hc-order-meta");customerHistory?.classList.add("hc-history-panel");statusHistory?.classList.add("hc-history-panel");
  }

  function compactPhase(){
    const root=$("phase1Root");if(!root)return;
    const panels=[...root.children].filter(x=>x.classList?.contains("detail-panel"));
    const warranty=panels.find(p=>p.querySelector("#phaseSaveMeta"));
    const items=panels.find(p=>p.querySelector("#phaseItemForm"));
    const payments=panels.find(p=>p.querySelector("#phasePaymentForm"));
    warranty?.classList.add("hc-warranty-panel");
    if(items){
      items.classList.add("hc-items-panel");
      if(!items.querySelector(".hc-products-heading")){
        const title=items.querySelector(".phase-title-row");
        if(title){const head=document.createElement("div");head.className="hc-products-heading";const h=title.querySelector("h3");if(h)head.appendChild(h);const btn=document.createElement("button");btn.type="button";btn.className="hc-add-toggle";btn.textContent="Добавить";head.appendChild(btn);title.insertAdjacentElement("beforebegin",head);btn.addEventListener("click",()=>{items.classList.toggle("hc-add-open");btn.textContent=items.classList.contains("hc-add-open")?"Скрыть":"Добавить";});}
      }
    }
    payments?.classList.add("hc-payments-panel");
  }

  function enhance(){
    if(!isMobile()||$("repairDetailOverlay")?.classList.contains("hidden"))return;
    if(!$("repairDetailBody")?.querySelector(".order-layout"))return;
    injectStyle();compactStatus();compactHeader();compactGeneral();makeTabs();compactPhase();
    const active=$("hcOrderTabs")?.querySelector(".active")?.dataset.hcTab||"general";setTab(active);
  }

  const observer=new MutationObserver(()=>queueMicrotask(enhance));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener("resize",()=>setTimeout(enhance,80),{passive:true});
  document.addEventListener("click",e=>{if(e.target.closest?.("[data-repair-id],[data-recent-repair]"))setTimeout(enhance,120);},true);
})();
