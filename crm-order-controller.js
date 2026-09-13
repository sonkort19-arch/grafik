(()=>{
  "use strict";

  const BASE_API="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const $=id=>document.getElementById(id);
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const adminToken=()=>readJson(ADMIN_SESSION_KEY)?.access_token||"";
  const crmSession=()=>{try{return localStorage.getItem(CRM_SESSION_KEY)||"";}catch(_){return"";}};
  const state={repairId:"",data:null,token:0,readyToken:0,closed:true};

  function headers(){const h={"Content-Type":"application/json","apikey":API_KEY};const a=adminToken(),s=crmSession();if(a)h.Authorization=`Bearer ${a}`;if(s)h["x-crm-session"]=s;return h;}
  function emit(name,detail={}){document.dispatchEvent(new CustomEvent(name,{detail:{...detail,repairId:state.repairId,token:state.token}}));}
  function setLoading(){const body=$("repairDetailBody");if(!body)return;body.innerHTML='<div class="crm-order-loading">Загружаем заказ…</div>';}
  function installStyle(){if($("crmOrderControllerStyle"))return;const style=document.createElement("style");style.id="crmOrderControllerStyle";style.textContent='.crm-order-loading{min-height:220px;display:flex;align-items:center;justify-content:center;padding:24px;color:#7b8794;font-size:14px;text-align:center}';document.head.appendChild(style);}

  function waitForBaseMarkup(token,data,attempt=0){
    if(token!==state.token||state.closed)return;
    const body=$("repairDetailBody");
    if(body?.querySelector(".order-layout")){
      if(state.readyToken===token)return;
      state.readyToken=token;
      body.dataset.orderRepairId=state.repairId;
      body.dataset.orderToken=String(token);
      emit("ma:order:ready",{data,repair:data?.repair||null,body});
      return;
    }
    if(attempt>=90){emit("ma:order:error",{message:"Карточка заказа не успела отрисоваться"});return;}
    requestAnimationFrame(()=>waitForBaseMarkup(token,data,attempt+1));
  }

  function acceptBaseData(data){
    const repair=data?.repair;if(!repair?.id)return;
    state.repairId=String(repair.id);state.data=data;state.closed=false;state.token++;state.readyToken=0;
    const token=state.token;
    emit("ma:order:data",{data,repair});
    requestAnimationFrame(()=>waitForBaseMarkup(token,data));
  }

  function close(){
    if(state.closed)return;
    const old={repairId:state.repairId,data:state.data,token:state.token};
    state.closed=true;state.repairId="";state.data=null;state.token++;state.readyToken=0;
    document.dispatchEvent(new CustomEvent("ma:order:closed",{detail:old}));
  }

  async function readRepair(id){
    const res=await fetch(BASE_API,{method:"POST",headers:headers(),body:JSON.stringify({op:"repair",id}),cache:"no-store"});
    const data=await res.json().catch(()=>({ok:false,error:"Сервер вернул непонятный ответ"}));
    if(!res.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${res.status}`);
    return data;
  }

  function installFetchBridge(){
    if(window.__maOrderFetchBridge)return;
    const upstream=window.fetch.bind(window);
    window.fetch=async function(input,init={}){
      const url=typeof input==="string"?input:input?.url||"";
      let body=null;
      if(url.startsWith(BASE_API)&&init?.body){try{body=JSON.parse(String(init.body));}catch(_){}}
      const response=await upstream(input,init);
      if(response.ok&&body?.op==="repair"){
        try{const data=await response.clone().json();queueMicrotask(()=>acceptBaseData(data));}catch(_){ }
      }
      return response;
    };
    window.__maOrderFetchBridge=true;
  }

  function installDomBridge(){
    document.addEventListener("click",event=>{
      const opener=event.target.closest?.("[data-repair-id],[data-recent-repair]");
      if(opener){installStyle();setTimeout(setLoading,0);}
      if(event.target.closest?.("#closeRepairDetail"))close();
    },true);
  }

  function updateSnapshot(patch){
    if(!state.data?.repair)return;
    state.data={...state.data,repair:{...state.data.repair,...patch}};
    emit("ma:order:changed",{data:state.data,repair:state.data.repair,patch});
  }

  function sectionChanged(section,payload={}){emit("ma:order:section-changed",{section,...payload});}

  installStyle();installFetchBridge();installDomBridge();
  window.MAOrderController={
    get current(){return state.data;},
    get repair(){return state.data?.repair||null;},
    get repairId(){return state.repairId;},
    get token(){return state.token;},
    readRepair,
    updateSnapshot,
    sectionChanged,
    close,
  };
})();
