(()=>{
  "use strict";
  if(window.MAOrderController?.version==="5")return;

  const ORDER_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-order-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const $=id=>document.getElementById(id);
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const adminToken=()=>readJson(ADMIN_SESSION_KEY)?.access_token||"";
  const crmSession=()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}};

  const state={repairId:"",data:null,loading:false,error:null,token:0,readyToken:0,closed:true,request:null,renderer:null,authErrorHandler:null,sectionLoaders:new Map(),sectionData:new Map(),sectionRequests:new Map()};

  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY};const a=adminToken(),s=crmSession();if(a)h.Authorization=`Bearer ${a}`;if(s)h["x-crm-session"]=s;return h;}
  function emit(name,detail={}){document.dispatchEvent(new CustomEvent(name,{detail:{...detail,repairId:state.repairId,token:state.token}}));}
  function installStyle(){if($("crmOrderControllerStyle"))return;const style=document.createElement("style");style.id="crmOrderControllerStyle";style.textContent='.crm-order-loading,.crm-order-error{min-height:220px;display:flex;align-items:center;justify-content:center;padding:24px;color:#7b8794;font-size:14px;text-align:center}.crm-order-error{color:#b42318}';document.head.appendChild(style);}
  function showOverlay(){const overlay=$("repairDetailOverlay");if(overlay)overlay.classList.remove("hidden");document.body.style.overflow="hidden";}
  function setLoading(){const body=$("repairDetailBody");if(body)body.innerHTML='<div class="crm-order-loading">Загружаем заказ…</div>';}
  function setError(message){const body=$("repairDetailBody");if(body)body.innerHTML=`<div class="crm-order-error">${String(message||"Не удалось открыть заказ").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}</div>`;}
  function abortBase(){if(state.request){try{state.request.abort();}catch(_){ }state.request=null;}}
  function abortSections(){for(const controller of state.sectionRequests.values()){try{controller.abort();}catch(_){ }}state.sectionRequests.clear();}

  async function readRepair(id,{signal}={}){const res=await fetch(ORDER_API,{method:"POST",headers:headers(),body:JSON.stringify({op:"detail",id}),signal,cache:"no-store"});const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));if(!res.ok||data?.ok===false){const error=new Error(data?.error||`Ошибка ${res.status}`);error.status=res.status;throw error;}return data;}

  function waitForBaseMarkup(token,data,attempt=0){if(token!==state.token||state.closed)return;const body=$("repairDetailBody");if(body?.querySelector(".order-layout")){if(state.readyToken===token)return;state.readyToken=token;body.dataset.orderRepairId=state.repairId;body.dataset.orderToken=String(token);emit("ma:order:ready",{data,repair:data?.repair||null,body});return;}if(attempt>=90){const message="Карточка заказа не успела отрисоваться";state.error=message;emit("ma:order:error",{message});return;}requestAnimationFrame(()=>waitForBaseMarkup(token,data,attempt+1));}

  async function open(id,options={}){
    const repairId=String(id||"").trim();if(!repairId)return null;
    installStyle();abortBase();abortSections();state.sectionData.clear();
    const token=++state.token;state.readyToken=0;state.repairId=repairId;state.data=null;state.loading=true;state.error=null;state.closed=false;
    const controller=new AbortController();state.request=controller;showOverlay();if(!options.keepMarkup)setLoading();emit("ma:order:opening",{repairId,reason:options.reason||"open"});
    try{const data=await readRepair(repairId,{signal:controller.signal});if(controller.signal.aborted||token!==state.token||state.closed)return null;state.request=null;state.data=data;state.loading=false;state.error=null;if(typeof state.renderer!=="function")throw new Error("Рендерер карточки заказа не подключён");state.renderer(data,{token,reason:options.reason||"open"});emit("ma:order:loaded",{data,repair:data?.repair||null});requestAnimationFrame(()=>waitForBaseMarkup(token,data));return data;}
    catch(error){if(error?.name==="AbortError"||controller.signal.aborted||token!==state.token)return null;state.request=null;state.loading=false;state.error=error?.message||"Не удалось открыть заказ";if(Number(error?.status)===403&&typeof state.authErrorHandler==="function")state.authErrorHandler(state.error);else setError(state.error);emit("ma:order:error",{message:state.error,error});return null;}
  }

  async function refresh(options={}){if(!state.repairId||state.closed)return null;return open(state.repairId,{...options,reason:options.reason||"refresh",keepMarkup:options.keepMarkup===true});}
  function registerRenderer(renderer){state.renderer=typeof renderer==="function"?renderer:null;}
  function registerAuthErrorHandler(handler){state.authErrorHandler=typeof handler==="function"?handler:null;}
  function registerSection(name,loader){const key=String(name||"").trim();if(!key||typeof loader!=="function")return;state.sectionLoaders.set(key,loader);}
  function unregisterSection(name){const key=String(name||"").trim();state.sectionLoaders.delete(key);const req=state.sectionRequests.get(key);if(req){try{req.abort();}catch(_){ }state.sectionRequests.delete(key);}state.sectionData.delete(key);}
  function setSection(name,data,{emitChange=true}={}){const key=String(name||"").trim();if(!key)return;state.sectionData.set(key,data);if(emitChange)emit("ma:order:section-changed",{section:key,data});}
  function getSection(name){return state.sectionData.get(String(name||"").trim())||null;}
  async function refreshSection(name,options={}){const key=String(name||"").trim(),loader=state.sectionLoaders.get(key);if(!key||!loader||!state.repairId||state.closed)return null;const previous=state.sectionRequests.get(key);if(previous){try{previous.abort();}catch(_){ }}const controller=new AbortController();state.sectionRequests.set(key,controller);const token=state.token,repairId=state.repairId;emit("ma:order:section-loading",{section:key});try{const data=await loader({repairId,token,signal:controller.signal,current:state.data,force:options.force===true});if(controller.signal.aborted||state.closed||token!==state.token||repairId!==state.repairId)return null;state.sectionRequests.delete(key);state.sectionData.set(key,data);emit("ma:order:section-loaded",{section:key,data});return data;}catch(error){if(error?.name==="AbortError"||controller.signal.aborted||token!==state.token)return null;state.sectionRequests.delete(key);emit("ma:order:section-error",{section:key,message:error?.message||"Не удалось загрузить раздел",error});throw error;}}
  function updateSnapshot(patch){if(!state.data?.repair)return;state.data={...state.data,repair:{...state.data.repair,...patch}};emit("ma:order:changed",{data:state.data,repair:state.data.repair,patch});}
  function replaceSnapshot(data){if(!data?.repair)return;state.data=data;state.repairId=String(data.repair.id||state.repairId);emit("ma:order:changed",{data,repair:data.repair,replace:true});}
  function close(){if(state.closed)return;const old={repairId:state.repairId,data:state.data,token:state.token};abortBase();abortSections();state.sectionData.clear();state.closed=true;state.repairId="";state.data=null;state.loading=false;state.error=null;state.token++;state.readyToken=0;const overlay=$("repairDetailOverlay");if(overlay)overlay.classList.add("hidden");document.body.style.overflow="";document.dispatchEvent(new CustomEvent("ma:order:closed",{detail:old}));}

  installStyle();window.MAOrderController={version:"5",get current(){return state.data;},get repair(){return state.data?.repair||null;},get repairId(){return state.repairId;},get token(){return state.token;},get loading(){return state.loading;},get error(){return state.error;},open,close,refresh,readRepair,registerRenderer,registerAuthErrorHandler,registerSection,unregisterSection,refreshSection,setSection,getSection,updateSnapshot,replaceSnapshot};
})();
