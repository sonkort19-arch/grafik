(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  let openSeq=0;

  function injectStyle(){
    if($("crmOrderStabilityStyle"))return;
    const style=document.createElement("style");
    style.id="crmOrderStabilityStyle";
    style.textContent=`
      @media(max-width:760px){
        #repairDetailBody .crm-fast-preview{display:none!important}
        #repairDetailBody .crm-stable-loading{min-height:220px;display:flex;align-items:center;justify-content:center;color:#8a94a6;font-size:14px;padding:24px;text-align:center}
      }
    `;
    document.head.appendChild(style);
  }

  function normalizePreview(){
    const body=$("repairDetailBody");if(!body)return;
    const preview=body.querySelector(".crm-fast-preview");if(!preview)return;
    body.innerHTML='<div class="crm-stable-loading">Загружаем карточку заказа…</div>';
  }

  function onOrderOpen(event){
    const row=event.target.closest?.("[data-repair-id],[data-recent-repair]");if(!row)return;
    const seq=++openSeq;
    const overlay=$("repairDetailOverlay"),body=$("repairDetailBody");
    if(overlay)overlay.dataset.openSeq=String(seq);
    if(body){body.dataset.openSeq=String(seq);queueMicrotask(normalizePreview);setTimeout(normalizePreview,0);setTimeout(normalizePreview,16);}
  }

  function guardOverlay(){
    const overlay=$("repairDetailOverlay");if(!overlay)return;
    new MutationObserver(()=>{
      if(overlay.classList.contains("hidden"))return;
      normalizePreview();
    }).observe(overlay,{attributes:true,attributeFilter:["class"]});
  }

  injectStyle();
  document.addEventListener("click",onOrderOpen,true);
  const body=$("repairDetailBody");if(body)new MutationObserver(normalizePreview).observe(body,{childList:true,subtree:true});
  guardOverlay();
})();
