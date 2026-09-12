import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-crm-session",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});}
function text(v:unknown,max=500){return String(v??"").trim().slice(0,max);}
function decimal(v:unknown,max=100000000){const n=Number(String(v??0).replace(/\s/g,"").replace(",","."));if(!Number.isFinite(n)||n<0||n>max)throw new Error("Неверное числовое значение");return Math.round(n*100)/100;}
function positive(v:unknown,max=10000){const n=decimal(v,max);if(n<=0)throw new Error("Значение должно быть больше нуля");return n;}

async function validateRepairAccess(req:Request,repairId:string){
  const headers:Record<string,string>={"Content-Type":"application/json"};
  for(const name of ["authorization","apikey","x-crm-session"]){const value=req.headers.get(name);if(value)headers[name]=value;}
  const res=await fetch(`${SUPABASE_URL}/functions/v1/ma-crm-phase1-api`,{method:"POST",headers,body:JSON.stringify({op:"detail",id:repairId})});
  const data=await res.json().catch(()=>null);
  if(!res.ok||!data?.ok)throw new Error(data?.error||"Нет доступа к заказу");
  return data.repair;
}

async function recalc(repairId:string){
  const {data,error}=await db.from("ma_crm_repair_items").select("quantity,unit_price,unit_cost,display_type,item_type").eq("repair_id",repairId).order("created_at");
  if(error)throw error;
  const items=data||[];
  const total=Math.round(items.reduce((s:any,x:any)=>s+Number(x.quantity||0)*Number(x.unit_price||0),0)*100)/100;
  const cost=Math.round(items.reduce((s:any,x:any)=>s+Number(x.quantity||0)*Number(x.unit_cost||0),0)*100)/100;
  const finalPrice=items.length?total:null;
  const {error:updateError}=await db.from("ma_crm_repairs").update({final_price:finalPrice,updated_at:new Date().toISOString()}).eq("id",repairId);
  if(updateError)throw updateError;
  return {items,total,cost,profit:Math.round((total-cost)*100)/100,finalPrice};
}

async function detail(req:Request,body:any){
  const repairId=text(body.repairId||body.id,80);if(!repairId)throw new Error("Не указан заказ");
  const repair=await validateRepairAccess(req,repairId);
  const totals=await recalc(repairId);
  return {ok:true,repair,items:totals.items,totals:{itemsTotal:totals.total,cost:totals.cost,profit:totals.profit,finalPrice:totals.finalPrice}};
}

async function upsert(req:Request,body:any){
  const repairId=text(body.repairId,80);if(!repairId)throw new Error("Не указан заказ");
  await validateRepairAccess(req,repairId);
  const displayType=text(body.itemType,20);
  if(displayType!=="service"&&displayType!=="part")throw new Error("Выбери тип позиции");
  const title=text(body.title,240);if(!title)throw new Error("Укажи название услуги или запчасти");
  const quantity=positive(body.quantity,10000),unitPrice=decimal(body.unitPrice),unitCost=decimal(body.unitCost);
  const storedType=displayType==="part"||unitCost>0?"part":"service";
  const payload:any={repair_id:repairId,item_type:storedType,display_type:displayType,title,quantity,unit_price:unitPrice,unit_cost:unitCost,updated_at:new Date().toISOString()};
  const id=text(body.id,80);let data,error;
  if(id)({data,error}=await db.from("ma_crm_repair_items").update(payload).eq("id",id).eq("repair_id",repairId).select("*").single());
  else ({data,error}=await db.from("ma_crm_repair_items").insert({...payload,created_by:text(body.actor,100)}).select("*").single());
  if(error)throw error;
  const totals=await recalc(repairId);
  return {ok:true,item:data,items:totals.items,finalPrice:totals.finalPrice,totals:{itemsTotal:totals.total,cost:totals.cost,profit:totals.profit}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"POST only"},405);
  try{
    const body=await req.json().catch(()=>({}));const op=text(body.op,60);
    if(op==="detail")return json(await detail(req,body));
    if(op==="upsert-item")return json(await upsert(req,body));
    return json({ok:false,error:"Неизвестная операция"},400);
  }catch(e:any){console.error("ma-crm-item-cost-api",e);const msg=e?.message||"Ошибка CRM";return json({ok:false,error:msg},/Нет доступа|Нужен вход/i.test(msg)?403:400);}
});
