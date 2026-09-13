(()=>{
  "use strict";
  if(window.MACRMWarrantyGuard?.version==="1")return;

  const API_URL="https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-crm-final-api";
  const API_KEY="sb_publishable_tSqbw3aeAgxYuzHhQurCuw_yDze4ZNn";
  const ADMIN_SESSION_KEY="ma_schedule_admin_session_v1";
  const CRM_SESSION_KEY="ma_crm_session_v1";
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}};
  const headers=()=>{const h={"Content-Type":"application/json","apikey":API_KEY},token=readJson(ADMIN_SESSION_KEY)?.access_token,session=localStorage.getItem(CRM_SESSION_KEY)||"";if(token)h.Authorization=`Bearer ${token}`;if(session)h["x-crm-session"]=session;return h;};
  function toast(message){const root=document.getElementById("crmToast");if(!root)return;root.textContent=String(message||"");root.classList.add("show");setTimeout(()=>root.classList.remove("show"),2800);}
  async function createWarranty(id,reason,key){const response=await fetch(API_URL,{method:"POST",headers:headers(),body:JSON.stringify({op:"create-warranty",id,reason,idempotencyKey:key}),cache:"no-store"}),data=await response.json().catch(()=>({ok:false,error:"Некорректный ответ сервера"}));if(!response.ok||data?.ok===false)throw new Error(data?.error||`Ошибка ${response.status}`);return data;}

  document.addEventListener("click",async event=>{
    const button=event.target.closest?.("#finalWarrantyCreate");
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(button.disabled||button.dataset.warrantyBusy==="1")return;

    const modal=button.closest(".final-modal");
    const reason=String(modal?.querySelector("#finalWarrantyReason")?.value||"").trim();
    const repairId=String(window.MAOrderController?.repairId||window.MAOrderController?.repair?.id||"").trim();
    if(!reason){toast("Укажи причину гарантийного обращения");return;}
    if(!repairId){toast("Открой заказ заново");return;}

    const key=modal?.dataset.warrantyRequestKey||(crypto.randomUUID?.()||`${repairId}:${Date.now()}`);
    if(modal)modal.dataset.warrantyRequestKey=key;
    const oldText=button.textContent;
    button.dataset.warrantyBusy="1";
    button.disabled=true;
    button.textContent="Создаём…";
    try{
      const data=await createWarranty(repairId,reason,key);
      modal?.remove();
      toast(`Гарантийный заказ №${data?.repair?.order_no||""} создан`);
      document.getElementById("closeRepairDetail")?.click();
      setTimeout(()=>document.querySelector('[data-view="orders"]')?.click(),80);
    }catch(error){
      toast(error?.message||"Не удалось создать гарантийный заказ");
      button.disabled=false;
      button.dataset.warrantyBusy="0";
      button.textContent=oldText||"Создать заказ";
    }
  },true);

  window.MACRMWarrantyGuard={version:"1"};
})();
