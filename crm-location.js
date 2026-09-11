(()=>{
  "use strict";

  const KEY="ma_crm_location_v2";
  const BASE_FRAGMENT="/functions/v1/ma-crm-api";
  const rawFetch=window.fetch.bind(window);
  let mounted=false;

  function selected(){try{return localStorage.getItem(KEY)||"";}catch(_){return"";}}
  function save(value){try{localStorage.setItem(KEY,value||"");}catch(_){ }}
  function escapeHtml(value){return String(value||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));}

  window.fetch=async function(input,init={}){
    const url=typeof input==="string"?input:input?.url||"";
    const service=selected();
    if(!service||!url.includes(BASE_FRAGMENT)||!init?.body)return rawFetch(input,init);

    let body;
    try{body=JSON.parse(String(init.body));}catch(_){return rawFetch(input,init);}

    if(body?.op==="list-repairs")body.service=service;
    const response=await rawFetch(input,{...init,body:JSON.stringify(body)});
    if(!response.ok||body?.op!=="list-sales")return response;

    try{
      const data=await response.clone().json();
      if(Array.isArray(data?.sales))data.sales=data.sales.filter(row=>String(row.service||"")===service);
      return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:response.headers});
    }catch(_){return response;}
  };

  function availableServices(){
    return [...document.querySelectorAll("#repairService option")]
      .map(option=>String(option.value||"").trim())
      .filter(Boolean);
  }

  function syncForms(service){
    if(!service)return;
    ["repairService","saleService"].forEach(id=>{
      const el=document.getElementById(id);
      if(el&&[...el.options].some(option=>option.value===service))el.value=service;
    });
  }

  function refreshForLocation(service){
    const repairFilter=document.getElementById("repairServiceFilter");
    if(repairFilter){
      repairFilter.value=service;
      repairFilter.dispatchEvent(new Event("change",{bubbles:true}));
    }
    syncForms(service);
    window.__maCrmSessionCache?.clear?.();
    const refresh=document.getElementById("refreshDashboard");
    if(refresh&&!refresh.disabled)refresh.click();
    document.dispatchEvent(new CustomEvent("ma:crm-location-change",{detail:{service}}));
  }

  function mount(){
    if(mounted||document.getElementById("crmLocationSwitch"))return true;
    const services=availableServices();
    const actions=document.querySelector(".topbar-actions");
    if(!actions||!services.length)return false;

    mounted=true;
    const label=document.createElement("label");
    label.className="crm-location-picker";
    label.title="Рабочая точка";
    const select=document.createElement("select");
    select.id="crmLocationSwitch";
    select.setAttribute("aria-label","Рабочая точка");
    select.innerHTML='<option value="">Все точки</option>'+services.map(service=>`<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`).join("");

    const saved=selected();
    select.value=services.includes(saved)?saved:"";
    label.appendChild(select);
    actions.insertBefore(label,actions.firstChild);

    const style=document.createElement("style");
    style.textContent='.crm-location-picker{display:flex;align-items:center}.crm-location-picker select{height:38px;max-width:190px;border:1px solid #d8dde6;border-radius:10px;background:#fff;padding:0 30px 0 11px;font:600 13px system-ui;color:#20242b}.crm-location-picker select:focus{outline:2px solid rgba(37,99,235,.18);border-color:#2563eb}@media(max-width:760px){.topbar-actions{gap:7px}.crm-location-picker select{height:36px;max-width:118px;font-size:16px;padding-left:9px}.online-state{display:none}}';
    document.head.appendChild(style);

    select.addEventListener("change",()=>{
      const service=select.value;
      save(service);
      refreshForLocation(service);
    });

    if(select.value){
      syncForms(select.value);
      setTimeout(()=>refreshForLocation(select.value),0);
    }
    return true;
  }

  if(!mount()){
    const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});
    observer.observe(document.documentElement,{subtree:true,childList:true});
    setTimeout(()=>observer.disconnect(),10000);
  }
})();
