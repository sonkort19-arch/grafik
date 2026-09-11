(()=>{
"use strict";
const KEY="ma_crm_location_v1",BASE="ma-crm-api";
const rawFetch=window.fetch.bind(window);
const selected=()=>{try{return localStorage.getItem(KEY)||""}catch(_){return""}};
const save=v=>{try{localStorage.setItem(KEY,v||"")}catch(_){}};
function patchResponse(data,service){
  if(!service||!data||typeof data!=="object")return data;
  if(Array.isArray(data.repairs))data.repairs=data.repairs.filter(x=>String(x.service||"")===service);
  if(Array.isArray(data.sales))data.sales=data.sales.filter(x=>String(x.service||"")===service);
  return data;
}
window.fetch=async function(input,init={}){
  const url=typeof input==="string"?input:input?.url||"",service=selected();
  if(!service||!url.includes(BASE)||!init?.body)return rawFetch(input,init);
  let body;try{body=JSON.parse(String(init.body));}catch(_){return rawFetch(input,init)}
  if(body?.op==="list-repairs")body.service=service;
  const response=await rawFetch(input,{...init,body:JSON.stringify(body)});
  if(!response.ok||!["list-repairs","list-sales"].includes(body?.op))return response;
  try{const data=patchResponse(await response.clone().json(),service);return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:response.headers});}catch(_){return response}
};
function services(){return [...document.querySelectorAll("#repairService option")].map(o=>o.value).filter(Boolean)}
function setModuleSelects(service){
  document.querySelectorAll("select").forEach(el=>{
    if(el.id==="crmLocationSwitch")return;
    const id=(el.id||"").toLowerCase();
    if(!/(service|location|point|branch|точк)/.test(id))return;
    if([...el.options].some(o=>o.value===service)){el.value=service;el.dispatchEvent(new Event("change",{bubbles:true}));}
  });
}
function mount(){
  if(document.getElementById("crmLocationSwitch"))return true;
  const list=services();if(!list.length)return false;
  const actions=document.querySelector(".topbar-actions");if(!actions)return false;
  const wrap=document.createElement("label");wrap.className="crm-location-picker";wrap.title="Рабочая точка";
  const select=document.createElement("select");select.id="crmLocationSwitch";select.setAttribute("aria-label","Рабочая точка");
  select.innerHTML='<option value="">Все точки</option>'+list.map(x=>`<option value="${x.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\"/g,"&quot;")}">${x}</option>`).join("");
  const saved=selected();select.value=list.includes(saved)?saved:"";wrap.append(select);actions.insertBefore(wrap,actions.firstChild);
  const style=document.createElement("style");style.textContent='.crm-location-picker{display:flex;align-items:center}.crm-location-picker select{height:38px;max-width:190px;border:1px solid #d8dde6;border-radius:10px;background:#fff;padding:0 30px 0 11px;font:600 13px system-ui;color:#20242b}.crm-location-picker select:focus{outline:2px solid rgba(37,99,235,.18);border-color:#2563eb}@media(max-width:760px){.topbar-actions{gap:7px}.crm-location-picker select{height:36px;max-width:118px;font-size:16px;padding-left:9px}.online-state{display:none}}';document.head.append(style);
  const apply=()=>{const s=select.value;save(s);const f=document.getElementById("repairServiceFilter");if(f){f.value=s;f.dispatchEvent(new Event("change",{bubbles:true}));}if(s)setModuleSelects(s);window.__maCrmSessionCache?.clear?.();document.getElementById("refreshDashboard")?.click();document.dispatchEvent(new CustomEvent("ma:crm-location-change",{detail:{service:s}}));};
  select.addEventListener("change",apply);
  if(select.value)setTimeout(()=>setModuleSelects(select.value),0);
  return true;
}
const obs=new MutationObserver(()=>{if(mount()){const s=selected();if(s)setModuleSelects(s)}});obs.observe(document.documentElement,{subtree:true,childList:true});
mount();
})();
