(()=>{
  "use strict";

  const MOBILE="(max-width: 760px)";
  const MONEY_FMT=new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2});
  const $=id=>document.getElementById(id);
  const isMobile=()=>window.matchMedia(MOBILE).matches;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const money=v=>MONEY_FMT.format(num(v))+" ₽";
  let activeTab="general",activeRepairId="",refs=null,visiblePanels=new Set(),resizeFrame=0;

  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}
  function injectStyle(){
    if($("compactOrderStyleV4"))return;
    const style=document.createElement("style");style.id="compactOrderStyleV4";style.textContent=`
      @media(max-width:760px){
        #repairDetailOverlay{padding:0;background:#f4f6f9;align-items:stretch}
        #repairDetailOverlay .order-modal{width:100%;max-width:none;height:100dvh;max-height:none;border-radius:0;background:#fff;display:flex;flex-direction:column;overflow:hidden}
        #repairDetailOverlay .order-modal-head{padding:12px 15px 9px;border-bottom:1px solid #e5eaf1;background:#fff;align-items:flex-start}
        #repairDetailOverlay .order-modal-head h2{font-size:20px;line-height:1.15;margin:3px 0 0}
        #repairDetailOverlay .order-modal-head p{font-size:12px;margin:4px 0 0;color:#697386;padding-right:52px}
        #repairDetailOverlay #closeRepairDetail{width:42px;height:42px;border-radius:11px;flex:0 0 42px;font-size:22px;touch-action:manipulation}
        .hc-order-amount{font-size:20px;font-weight:850;color:#172033;margin-top:7px}
        #repairDetailOverlay .order-modal-body{flex:1;overflow:auto;padding:0 0 calc(24px + env(safe-area-inset-bottom));background:#fff;overscroll-behavior:contain}
        #repairDetailOverlay .order-layout{display:block!important;padding:0!important;gap:0!important}
        #repairDetailOverlay .order-main,#repairDetailOverlay .order-side{display:contents!important}
        #repairDetailOverlay .detail-panel{border:0!important;border-radius:0!important;box-shadow:none!important;margin:0!important;padding:13px 15px!important;border-bottom:1px solid #e9edf3!important;background:#fff!important;content-visibility:auto;contain-intrinsic-size:1px 220px}
        #repairDetailOverlay .detail-panel h3{font-size:15px;margin:0 0 10px}
        .hc-status-panel>h3{display:none}
        .hc-status-current{width:100%;min-height:44px;border:0;border-radius:10px;background:#246BFD;color:#fff;font:inherit;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .hc-status-current:after{content:'⌄';font-size:15px}
        .hc-status-panel .status-stepper{display:none!important;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px;overflow:visible!important}
        .hc-status-panel.hc-status-open .status-stepper{display:grid!important}
        .hc-status-panel .status-stepper button{min-width:0!important;min-height:40px!important;border-radius:9px!important;font-size:12px!important;padding:7px!important;touch-action:manipulation}
        .hc-tabs{position:sticky;top:0;z-index:8;display:flex;overflow-x:auto;scrollbar-width:none;background:#fff;border-bottom:1px solid #e5eaf1;padding:0 7px;-webkit-overflow-scrolling:touch;contain:layout paint}.hc-tabs::-webkit-scrollbar{display:none}
        .hc-tabs button{flex:0 0 auto;border:0;background:transparent;padding:11px 9px 9px;color:#8a94a6;font:inherit;font-size:11px;font-weight:800;white-space:nowrap;border-bottom:2px solid transparent;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .hc-tabs button.active{color:#172033;border-bottom-color:#246BFD}
        .hc-panel-hidden{display:none!important}
        .hc-info-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.hc-info-head h3{margin:0!important}
        .hc-edit-toggle,.hc-add-toggle{border:1px solid #dce3ec;background:#fff;color:#172033;border-radius:9px;padding:7px 10px;font:inherit;font-size:12px;font-weight:800;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .hc-edit-panel{display:none}.hc-edit-panel.hc-edit-open{display:block}
        .hc-edit-panel .edit-grid{grid-template-columns:1fr!important;gap:8px!important}.hc-edit-panel input,.hc-edit-panel select,.hc-edit-panel textarea{min-height:42px!important;font-size:16px!important}
        #phase1Root{display:contents!important}#phase1Root>.detail-panel{padding:13px 15px!important}
        #phase1Root .phase-add-form{grid-template-columns:1fr!important;gap:8px!important}#phase1Root .phase-add-form input,#phase1Root .phase-add-form select,#phase1Root .phase-add-form button{width:100%!important;min-height:44px!important;font-size:16px!important}
        #phase1Root .phase-money-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}
        .hc-products-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
        .hc-items-panel .phase-add-form,.hc-items-panel #serviceCostPreview{display:none!important}.hc-items-panel.hc-add-open .phase-add-form{display:grid!important}.hc-items-panel.hc-add-open #serviceCostPreview{display:flex!important}
        .hc-history-empty,.hc-files-empty{padding:22px 15px;color:#7c8798;font-size:13px;text-align:center;border-bottom:1px solid #e9edf3}
      }
    `;document.head.appendChild(style);
  }

  function panelByHeading(text){const body=$("repairDetailBody");if(!body)return null;for(const p of body.querySelectorAll(".detail-panel")){if(String(p.querySelector("h3")?.textContent||"").trim()===text)return p;}return null;}
  function phasePanels(){const root=$("phase1Root");if(!root)return{};const panels=[...root.children].filter(x=>x.classList?.contains("detail-panel"));return{warranty:panels.find(p=>p.querySelector("#phaseSaveMeta")),items:panels.find(p=>p.querySelector("#phaseItemForm")),payments:panels.find(p=>p.querySelector("#phasePaymentForm"))};}
  function extraPanels(){return{events:$("maOrderEventsPanel"),files:$("crmFinalTools"),payroll:$("maOrderPayrollPanel")};}
  function rebuildRefs(){
    const tabs=$("hcOrderTabs"),phase=phasePanels(),extra=extraPanels();
    refs={
      tabs,
      tabButtons:new Map([...tabs?.querySelectorAll?.("[data-hc-tab]")||[]].map(b=>[b.dataset.hcTab,b])),
      client:panelByHeading("Клиент и устройство"),edit:panelByHeading("Редактирование"),order:panelByHeading("Заказ"),clientHistory:panelByHeading("История клиента"),statusHistory:panelByHeading("История статусов"),
      warranty:phase.warranty,items:phase.items,payments:phase.payments,events:extra.events,files:extra.files,payroll:extra.payroll
    };
    return refs;
  }

  function ensureHeader(){const head=document.querySelector("#repairDetailOverlay .order-modal-head");if(!head)return;let amount=head.querySelector(".hc-order-amount");if(!amount){amount=document.createElement("div");amount.className="hc-order-amount";head.querySelector("div")?.appendChild(amount);}const controller=window.MAOrderController,current=controller?.current,commerce=controller?.getSection?.("commerce"),total=commerce?.totals?.orderTotal??current?.paymentSummary?.total??current?.repair?.final_price??current?.repair?.estimated_price??0;setText(amount,money(total));}
  function ensureStatus(){const panel=panelByHeading("Статус заказа");if(!panel)return;panel.classList.add("hc-status-panel");let btn=panel.querySelector(".hc-status-current");if(!btn){btn=document.createElement("button");btn.type="button";btn.className="hc-status-current";panel.insertBefore(btn,panel.querySelector(".status-stepper"));btn.addEventListener("click",()=>panel.classList.toggle("hc-status-open"));}const label=panel.querySelector(".status-stepper button.current")?.textContent?.trim()||$("repairDetailStatus")?.textContent?.trim()||"Статус";setText(btn,label);}
  function ensureGeneral(){const client=panelByHeading("Клиент и устройство"),edit=panelByHeading("Редактирование");if(client&&!client.querySelector(".hc-info-head")){const h=client.querySelector("h3"),wrap=document.createElement("div");wrap.className="hc-info-head";if(h){h.replaceWith(wrap);wrap.appendChild(h);}const btn=document.createElement("button");btn.type="button";btn.className="hc-edit-toggle";btn.textContent="Изменить";wrap.appendChild(btn);btn.addEventListener("click",()=>{edit?.classList.toggle("hc-edit-open");setText(btn,edit?.classList.contains("hc-edit-open")?"Скрыть":"Изменить");});}edit?.classList.add("hc-edit-panel");}
  function ensurePhase(){const {items}=phasePanels();if(items){items.classList.add("hc-items-panel");if(!items.querySelector(".hc-products-heading")){const title=items.querySelector(".phase-title-row"),head=document.createElement("div");head.className="hc-products-heading";const h=title?.querySelector("h3");if(h)head.appendChild(h);const btn=document.createElement("button");btn.type="button";btn.className="hc-add-toggle";btn.textContent="Добавить";head.appendChild(btn);title?.insertAdjacentElement("beforebegin",head);btn.addEventListener("click",()=>window.MAItemPicker?.open?.());}}}
  function ensureTabs(){let tabs=$("hcOrderTabs");if(tabs)return tabs;const status=panelByHeading("Статус заказа");if(!status)return null;tabs=document.createElement("div");tabs.id="hcOrderTabs";tabs.className="hc-tabs";tabs.innerHTML='<button type="button" data-hc-tab="general">Общая информация</button><button type="button" data-hc-tab="items">Товары и услуги</button><button type="button" data-hc-tab="payments">Платежи</button><button type="button" data-hc-tab="history">История</button><button type="button" data-hc-tab="files">Файлы</button>';status.insertAdjacentElement("afterend",tabs);tabs.addEventListener("click",e=>{const b=e.target.closest("[data-hc-tab]");if(!b||b.dataset.hcTab===activeTab)return;setTab(b.dataset.hcTab);});return tabs;}
  function ensureEmpty(tab,visible){const id=tab==="history"?"hcHistoryEmpty":"hcFilesEmpty",existing=$(id);if(!visible){existing?.remove();return;}if(existing)return;const box=document.createElement("div");box.id=id;box.className=tab==="history"?"hc-history-empty":"hc-files-empty";box.textContent=tab==="history"?"История заказа загружается…":"Файлы и документы загружаются…";$("hcOrderTabs")?.insertAdjacentElement("afterend",box);}

  function targetPanels(tab,r){
    const out=[];
    if(tab==="general")out.push(r.client,r.edit,r.order,r.warranty);
    else if(tab==="items")out.push(r.items);
    else if(tab==="payments")out.push(r.payments);
    else if(tab==="history"){
      if(r.events)out.push(r.events);else out.push(r.clientHistory,r.statusHistory);
      if(r.payroll&&document.body.dataset.crmRole==="admin")out.push(r.payroll);
    }else if(tab==="files")out.push(r.files);
    return out.filter(Boolean);
  }

  function setTab(tab){
    activeTab=tab||"general";
    const r=refs||rebuildRefs();
    const previousButton=r.tabButtons?.get?.(r.activeTab),nextButton=r.tabButtons?.get?.(activeTab);
    previousButton?.classList.remove("active");
    nextButton?.classList.add("active");
    r.activeTab=activeTab;

    const next=new Set(targetPanels(activeTab,r));
    for(const panel of visiblePanels){if(!next.has(panel))panel.classList.add("hc-panel-hidden");}
    for(const panel of next){if(!visiblePanels.has(panel))panel.classList.remove("hc-panel-hidden");}
    visiblePanels=next;

    ensureEmpty("history",false);ensureEmpty("files",false);
    if(activeTab==="history"&&!r.events)ensureEmpty("history",!r.clientHistory&&!r.statusHistory);
    if(activeTab==="files"&&!r.files)ensureEmpty("files",true);
  }

  function initializeVisibility(){const r=refs||rebuildRefs();const all=[r.client,r.edit,r.order,r.clientHistory,r.statusHistory,r.warranty,r.items,r.payments,r.events,r.files,r.payroll].filter(Boolean);for(const panel of all)panel.classList.add("hc-panel-hidden");visiblePanels.clear();setTab(activeTab);}
  function enhanceBase(repairId){if(!isMobile())return;if(repairId!==activeRepairId){activeRepairId=repairId;activeTab="general";visiblePanels.clear();refs=null;}injectStyle();ensureStatus();ensureHeader();ensureGeneral();ensureTabs();refs=rebuildRefs();initializeVisibility();}
  function enhancePhase(repairId){if(!isMobile()||repairId!==activeRepairId)return;ensurePhase();ensureHeader();refs=rebuildRefs();initializeVisibility();}
  function refreshCurrent(){if(!activeRepairId||!isMobile())return;ensureHeader();refs=rebuildRefs();initializeVisibility();}

  document.addEventListener("ma:order:ready",e=>enhanceBase(String(e.detail?.repairId||e.detail?.repair?.id||"")));
  document.addEventListener("ma:order:phase-ready",e=>enhancePhase(String(e.detail?.repairId||"")));
  document.addEventListener("ma:order:section-loaded",refreshCurrent);
  document.addEventListener("ma:order:changed",()=>{ensureHeader();ensureStatus();});
  document.addEventListener("ma:order:closed",()=>{activeRepairId="";activeTab="general";refs=null;visiblePanels.clear();});
  window.addEventListener("resize",()=>{if(!activeRepairId||resizeFrame)return;resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;if(!activeRepairId)return;if(isMobile()){enhanceBase(activeRepairId);enhancePhase(activeRepairId);}else{refs=null;visiblePanels.clear();}});},{passive:true});
  window.MAOrderCompact={version:"7",setTab};
})();
