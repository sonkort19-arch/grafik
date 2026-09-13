(()=>{
  "use strict";

  const MOBILE_QUERY="(max-width: 760px), (orientation: landscape) and (max-width: 960px) and (max-height: 500px)";
  const root=document.documentElement;
  const mobile=()=>window.matchMedia(MOBILE_QUERY).matches;
  const lastViewport={height:0,top:0,width:0,keyboard:null};
  let viewportFrame=0;

  function blockingSurfaceOpen(){
    return Boolean(document.querySelector(
      "#loginOverlay:not(.hidden),#newRepairDrawer:not(.hidden),#repairDetailOverlay:not(.hidden),#saleOverlay:not(.hidden),.inv-overlay:not(.hidden),.fin-overlay:not(.hidden),.final-modal:not(.hidden),.issue-overlay:not(.hidden),.ma-item-picker:not(.hidden)"
    ));
  }

  function setCssVar(name,value,key){
    if(lastViewport[key]===value)return;
    lastViewport[key]=value;
    root.style.setProperty(name,`${value}px`);
  }

  function syncViewport(){
    if(!mobile()){
      root.style.removeProperty("--crm-visual-height");
      root.style.removeProperty("--crm-visual-top");
      root.style.removeProperty("--crm-visual-width");
      root.classList.remove("crm-keyboard-open");
      lastViewport.height=0;lastViewport.top=0;lastViewport.width=0;lastViewport.keyboard=null;
      return;
    }
    const vv=window.visualViewport;
    const height=Math.round(vv?.height||window.innerHeight||0);
    const top=Math.round(vv?.offsetTop||0);
    const width=Math.round(vv?.width||window.innerWidth||0);
    setCssVar("--crm-visual-height",height,"height");
    setCssVar("--crm-visual-top",top,"top");
    setCssVar("--crm-visual-width",width,"width");
    const layoutHeight=Math.round(window.innerHeight||height);
    const keyboard=layoutHeight-height>120;
    if(lastViewport.keyboard!==keyboard){lastViewport.keyboard=keyboard;root.classList.toggle("crm-keyboard-open",keyboard);}
  }

  function scheduleViewportSync(){
    if(viewportFrame)return;
    viewportFrame=requestAnimationFrame(()=>{viewportFrame=0;syncViewport();});
  }

  function repairOrphanedScrollLock(){
    if(!mobile()||blockingSurfaceOpen())return;
    if(document.body.style.overflow==="hidden")document.body.style.overflow="";
    if(document.documentElement.style.overflow==="hidden")document.documentElement.style.overflow="";
  }

  function injectMobileTouchFix(){
    if(document.getElementById("crmMobileTouchFix"))return;
    const style=document.createElement("style");
    style.id="crmMobileTouchFix";
    style.textContent=`@media (max-width:760px),(orientation:landscape) and (max-width:960px) and (max-height:500px){
      .topbar{background:#fff!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
      #openSidebar.mobile-menu{position:relative;z-index:3;pointer-events:auto!important;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      .workspace-content{touch-action:pan-y}
      .crm-workspace{min-height:100dvh}
    }`;
    document.head.appendChild(style);
  }

  function setSidebar(open){
    const sidebar=document.getElementById("crmSidebar"),backdrop=document.getElementById("sidebarBackdrop");
    if(!sidebar||!backdrop)return;
    sidebar.classList.toggle("open",open);
    backdrop.classList.toggle("hidden",!open);
  }

  function bindMobileMenuTouch(){
    const button=document.getElementById("openSidebar"),backdrop=document.getElementById("sidebarBackdrop");
    if(!button||button.dataset.mobileTouchBound==="1")return;
    button.dataset.mobileTouchBound="1";
    let lastTouchAt=0;
    const openMenu=event=>{
      if(!mobile())return;
      repairOrphanedScrollLock();
      if(event.cancelable)event.preventDefault();
      event.stopPropagation();
      setSidebar(true);
    };
    const closeMenu=event=>{
      if(!mobile())return;
      if(event.cancelable)event.preventDefault();
      event.stopPropagation();
      setSidebar(false);
      repairOrphanedScrollLock();
    };
    button.addEventListener("touchend",event=>{lastTouchAt=Date.now();openMenu(event);},{passive:false,capture:true});
    button.addEventListener("click",event=>{if(Date.now()-lastTouchAt<500){if(event.cancelable)event.preventDefault();event.stopPropagation();return;}openMenu(event);},true);
    backdrop?.addEventListener("touchend",event=>{lastTouchAt=Date.now();closeMenu(event);},{passive:false,capture:true});
    backdrop?.addEventListener("click",event=>{if(Date.now()-lastTouchAt<500){if(event.cancelable)event.preventDefault();event.stopPropagation();return;}closeMenu(event);},true);
  }

  function suppressNextProgrammaticFocus(el,duration=180){
    if(!el||!mobile())return;
    try{Object.defineProperty(el,"focus",{configurable:true,value:()=>{}});setTimeout(()=>{try{delete el.focus;}catch(_){ }},duration);}catch(_){ }
  }
  function guardLoginAutofocus(){
    const overlay=document.getElementById("loginOverlay");if(!overlay)return;
    const arm=()=>{if(overlay.classList.contains("hidden")||!mobile())return;suppressNextProgrammaticFocus(document.getElementById("crmLoginName"));suppressNextProgrammaticFocus(document.getElementById("crmLoginPin"));scheduleViewportSync();};
    new MutationObserver(arm).observe(overlay,{attributes:true,attributeFilter:["class"]});arm();
  }
  function keepFocusedControlVisible(event){
    if(!mobile())return;const el=event.target;if(!(el instanceof HTMLElement)||!el.matches("input,select,textarea"))return;
    if(!el.closest(".login-card,.drawer,.order-modal,.dialog-card,.inv-dialog,.fin-dialog,.final-dialog,.issue-dialog,.ma-item-sheet"))return;
    setTimeout(()=>{syncViewport();const vv=window.visualViewport,top=(vv?.offsetTop||0)+64,bottom=(vv?.offsetTop||0)+(vv?.height||window.innerHeight)-72,rect=el.getBoundingClientRect();if(rect.top>=top&&rect.bottom<=bottom)return;try{el.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"});}catch(_){el.scrollIntoView();}},120);
  }

  injectMobileTouchFix();syncViewport();guardLoginAutofocus();bindMobileMenuTouch();repairOrphanedScrollLock();
  window.addEventListener("resize",scheduleViewportSync,{passive:true});
  window.addEventListener("orientationchange",()=>setTimeout(()=>{scheduleViewportSync();repairOrphanedScrollLock();},120),{passive:true});
  window.addEventListener("pageshow",()=>{repairOrphanedScrollLock();scheduleViewportSync();},{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){repairOrphanedScrollLock();scheduleViewportSync();}},{passive:true});
  document.addEventListener("ma:order:closed",()=>setTimeout(repairOrphanedScrollLock,0));
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",scheduleViewportSync,{passive:true});
    window.visualViewport.addEventListener("scroll",()=>{if(blockingSurfaceOpen())scheduleViewportSync();},{passive:true});
  }
  document.addEventListener("focusin",keepFocusedControlVisible,true);
})();

const controllerReady=import("./crm-order-controller.js?v=20260913-v5");
const orderReady=controllerReady.then(()=>Promise.all([
  import("./crm-order-view.js?v=20260913-v3"),
  import("./crm-order-documents.js?v=20260913-v2")
]));
const pickerReady=orderReady.then(()=>import("./crm-item-picker.js?v=20260913-v2"));
orderReady.then(()=>import("./crm-issue.js?v=20260913-v3")).catch(err=>console.error("MA CRM issue module",err));
orderReady.then(()=>import("./crm-warranty-guard.js?v=20260913-v1")).catch(err=>console.error("MA CRM warranty guard",err));
pickerReady.then(()=>import("./crm-compact-order-v2.js?v=20260913-v6")).catch(err=>console.error("MA CRM compact order module",err));
orderReady.then(()=>import("./crm-order-history.js?v=20260913-v1")).catch(err=>console.error("MA CRM order history module",err));
