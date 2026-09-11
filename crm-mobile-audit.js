(()=>{
  "use strict";

  const MOBILE_QUERY="(max-width: 760px)";
  const root=document.documentElement;
  const mobile=()=>window.matchMedia(MOBILE_QUERY).matches;

  function syncViewport(){
    if(!mobile()){
      root.style.removeProperty("--crm-visual-height");
      root.style.removeProperty("--crm-visual-top");
      root.style.removeProperty("--crm-visual-width");
      root.classList.remove("crm-keyboard-open");
      return;
    }
    const vv=window.visualViewport;
    const height=Math.round(vv?.height||window.innerHeight||0);
    const top=Math.round(vv?.offsetTop||0);
    const width=Math.round(vv?.width||window.innerWidth||0);
    root.style.setProperty("--crm-visual-height",`${height}px`);
    root.style.setProperty("--crm-visual-top",`${top}px`);
    root.style.setProperty("--crm-visual-width",`${width}px`);
    const layoutHeight=Math.round(window.innerHeight||height);
    root.classList.toggle("crm-keyboard-open",layoutHeight-height>120);
  }

  function suppressNextProgrammaticFocus(el,duration=180){
    if(!el||!mobile())return;
    try{
      Object.defineProperty(el,"focus",{configurable:true,value:()=>{}});
      setTimeout(()=>{try{delete el.focus;}catch(_){ }},duration);
    }catch(_){ }
  }

  function guardLoginAutofocus(){
    const overlay=document.getElementById("loginOverlay");
    if(!overlay)return;
    const arm=()=>{
      if(overlay.classList.contains("hidden")||!mobile())return;
      suppressNextProgrammaticFocus(document.getElementById("crmLoginName"));
      suppressNextProgrammaticFocus(document.getElementById("crmLoginPin"));
      syncViewport();
    };
    new MutationObserver(arm).observe(overlay,{attributes:true,attributeFilter:["class"]});
    arm();
  }

  function keepFocusedControlVisible(event){
    if(!mobile())return;
    const el=event.target;
    if(!(el instanceof HTMLElement)||!el.matches("input,select,textarea"))return;
    if(!el.closest(".login-card,.drawer,.order-modal,.dialog-card,.inv-dialog,.fin-dialog,.final-dialog"))return;
    setTimeout(()=>{
      syncViewport();
      const vv=window.visualViewport;
      const top=(vv?.offsetTop||0)+64;
      const bottom=(vv?.offsetTop||0)+(vv?.height||window.innerHeight)-72;
      const rect=el.getBoundingClientRect();
      if(rect.top>=top&&rect.bottom<=bottom)return;
      try{el.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"});}
      catch(_){el.scrollIntoView();}
    },120);
  }

  syncViewport();
  guardLoginAutofocus();
  window.addEventListener("resize",syncViewport,{passive:true});
  window.addEventListener("orientationchange",()=>setTimeout(syncViewport,120),{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",syncViewport,{passive:true});
    window.visualViewport.addEventListener("scroll",syncViewport,{passive:true});
  }
  document.addEventListener("focusin",keepFocusedControlVisible,true);
})();
