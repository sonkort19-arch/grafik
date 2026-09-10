import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-crm-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "bul782@mail.ru").toLowerCase();
const PIN_PEPPER = Deno.env.get("PIN_PEPPER") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {auth:{persistSession:false,autoRefreshToken:false}});
const STATUSES = new Set(["accepted","diagnostics","in_work","waiting_part","ready","issued"]);

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}
function text(v:unknown,max=500){ return String(v??"").trim().slice(0,max); }
function money(v:unknown){
  if(v===null||v===undefined||v==="") return 0;
  const n=Number(String(v).replace(/\s/g,"").replace(",","."));
  if(!Number.isFinite(n)||n<0||n>100000000) throw new Error("Неверная сумма");
  return Math.round(n*100)/100;
}
function normalizePhone(v:unknown){
  let d=String(v??"").replace(/\D/g,"");
  if(d.length===11&&d.startsWith("8")) d="7"+d.slice(1);
  if(d.length===10) d="7"+d;
  if(d.length<10||d.length>15) throw new Error("Проверь номер телефона");
  return d;
}
function phoneDisplay(v:unknown){ const raw=text(v,40); return raw || "+"+normalizePhone(v); }
function b64url(bytes:Uint8Array){
  let s=""; for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function fromB64url(value:string){
  const base=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);
  const raw=atob(base); return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function hmac(value:string){
  if(!PIN_PEPPER) throw new Error("CRM auth is not configured");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(PIN_PEPPER),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)));
}
async function issueSession(employee:string){
  const payload=b64url(new TextEncoder().encode(JSON.stringify({employee,exp:Date.now()+12*60*60*1000,v:1})));
  return `${payload}.${b64url(await hmac(payload))}`;
}
async function readSession(req:Request){
  const token=req.headers.get("x-crm-session")||"";
  const [payload,sig]=token.split("."); if(!payload||!sig) return null;
  const expected=await hmac(payload),actual=fromB64url(sig); if(actual.length!==expected.length) return null;
  let diff=0; for(let i=0;i<actual.length;i++) diff|=actual[i]^expected[i]; if(diff!==0) return null;
  try{
    const data=JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if(!data?.employee||Number(data.exp)<Date.now()) return null;
    const {data:pin}=await admin.from("ma_employee_pins").select("employee,active").eq("employee",data.employee).eq("active",true).maybeSingle();
    return pin ? {kind:"staff",employee:String(data.employee)} : null;
  }catch(_){ return null; }
}
async function readAdmin(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,""); if(!token) return null;
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user||data.user.email?.toLowerCase()!==ADMIN_EMAIL) return null;
  return {kind:"admin",employee:"Администратор",email:data.user.email||ADMIN_EMAIL};
}
async function requireAuth(req:Request){
  const auth=await readAdmin(req) || await readSession(req);
  if(!auth) throw new Error("Нужен вход в CRM");
  return auth;
}
async function hashPin(pin:string){
  const bytes=new TextEncoder().encode(`${PIN_PEPPER}|${pin}`),digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function login(body:any){
  const employee=text(body.employee,80),pin=String(body.pin||"");
  if(!employee||!/^\d{4}$/.test(pin)) throw new Error("Укажи сотрудника и PIN из 4 цифр");
  const {data:guard}=await admin.from("ma_pin_guard").select("failed_attempts,locked_until").eq("employee",employee).maybeSingle();
  if(guard?.locked_until&&new Date(guard.locked_until)>new Date()) throw new Error("PIN временно заблокирован. Попробуй позже.");
  const {data:row}=await admin.from("ma_employee_pins").select("pin_hash,active").eq("employee",employee).maybeSingle();
  const ok=!!row?.active && (await hashPin(pin))===row.pin_hash;
  if(!ok){
    const failures=Number(guard?.failed_attempts||0)+1,lock=failures>=5?new Date(Date.now()+15*60*1000).toISOString():null;
    await admin.from("ma_pin_guard").upsert({employee,failed_attempts:lock?0:failures,locked_until:lock,updated_at:new Date().toISOString()});
    throw new Error(lock?"5 неверных PIN. Вход заблокирован на 15 минут":"Неверный PIN");
  }
  await admin.from("ma_pin_guard").upsert({employee,failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()});
  return {ok:true,employee,session:await issueSession(employee),expiresInHours:12};
}
async function bootstrap(req:Request){
  const actor=await requireAuth(req);
  const {data:cfg}=await admin.from("ma_schedule_config").select("settings").eq("id","main").maybeSingle();
  const s:any=cfg?.settings||{};
  const employees=[...(s.employeeSchedules||[])].filter((x:any)=>x?.name&&!x?.inactive).map((x:any)=>({name:String(x.name),role:String(x.role||"")}));
  return {ok:true,actor,services:[String(s.service1||"Моба"),String(s.service2||"Нова")],employees};
}
async function upsertCustomer(nameRaw:unknown,phoneRaw:unknown){
  const phone_normalized=normalizePhone(phoneRaw),phone=phoneDisplay(phoneRaw),name=text(nameRaw,120);
  const {data:existing,error:readError}=await admin.from("ma_crm_customers").select("*").eq("phone_normalized",phone_normalized).maybeSingle(); if(readError) throw readError;
  if(existing){
    const patch:any={phone,updated_at:new Date().toISOString()}; if(name) patch.name=name;
    const {data,error}=await admin.from("ma_crm_customers").update(patch).eq("id",existing.id).select("*").single(); if(error) throw error; return data;
  }
  const {data,error}=await admin.from("ma_crm_customers").insert({name,phone,phone_normalized}).select("*").single(); if(error) throw error; return data;
}
async function listRepairs(req:Request,body:any){
  await requireAuth(req);
  const {data,error}=await admin.from("ma_crm_repairs").select("*,customer:ma_crm_customers(id,name,phone,phone_normalized)").order("updated_at",{ascending:false}).limit(250); if(error) throw error;
  let rows:any[]=data||[]; const status=text(body.status,40),service=text(body.service,100),q=text(body.q,120).toLowerCase();
  if(status) rows=rows.filter(r=>r.status===status); if(service) rows=rows.filter(r=>r.service===service);
  if(q){ const digits=q.replace(/\D/g,""); rows=rows.filter(r=>[r.order_no,r.device,r.model,r.imei,r.issue,r.manager,r.master,r.customer?.name,r.customer?.phone].join(" ").toLowerCase().includes(q)||(digits&&String(r.customer?.phone_normalized||"").includes(digits))); }
  return {ok:true,repairs:rows.slice(0,150)};
}
async function repairDetail(req:Request,body:any){
  await requireAuth(req); const id=text(body.id,80); if(!id) throw new Error("Не указан заказ");
  const {data:repair,error}=await admin.from("ma_crm_repairs").select("*,customer:ma_crm_customers(*)").eq("id",id).single(); if(error) throw error;
  const {data:history}=await admin.from("ma_crm_repair_status_history").select("*").eq("repair_id",id).order("created_at",{ascending:false}).limit(50);
  const {data:pastRepairs}=await admin.from("ma_crm_repairs").select("id,order_no,device,model,status,accepted_at,final_price,estimated_price").eq("customer_id",repair.customer_id).neq("id",id).order("accepted_at",{ascending:false}).limit(20);
  const {data:sales}=await admin.from("ma_crm_sales").select("id,sale_no,device,model,imei,sale_price,sold_at").eq("customer_id",repair.customer_id).order("sold_at",{ascending:false}).limit(20);
  return {ok:true,repair,history:history||[],customerHistory:{repairs:pastRepairs||[],sales:sales||[]}};
}
async function createRepair(req:Request,body:any){
  const actor=await requireAuth(req),customer=await upsertCustomer(body.customerName,body.phone),service=text(body.service,100),issue=text(body.issue,1000);
  if(!service) throw new Error("Выбери точку"); if(!issue) throw new Error("Укажи неисправность");
  const payload={customer_id:customer.id,service,device:text(body.device,100),model:text(body.model,160),imei:text(body.imei,80),issue,estimated_price:money(body.estimatedPrice),manager:text(body.manager||actor.employee,100),master:text(body.master,100),status:"accepted",comment:text(body.comment,2000),created_by:actor.employee,updated_by:actor.employee};
  const {data,error}=await admin.from("ma_crm_repairs").insert(payload).select("*,customer:ma_crm_customers(id,name,phone)").single(); if(error) throw error;
  await admin.from("ma_crm_repair_status_history").insert({repair_id:data.id,old_status:null,new_status:"accepted",changed_by:actor.employee});
  return {ok:true,repair:data};
}
async function updateRepair(req:Request,body:any){
  const actor=await requireAuth(req),id=text(body.id,80); if(!id) throw new Error("Не указан заказ");
  const patch:any={updated_by:actor.employee,updated_at:new Date().toISOString()};
  if("device" in body) patch.device=text(body.device,100); if("model" in body) patch.model=text(body.model,160); if("imei" in body) patch.imei=text(body.imei,80);
  if("issue" in body){ patch.issue=text(body.issue,1000); if(!patch.issue) throw new Error("Неисправность не может быть пустой"); }
  if("estimatedPrice" in body) patch.estimated_price=money(body.estimatedPrice); if("finalPrice" in body) patch.final_price=body.finalPrice===""||body.finalPrice===null?null:money(body.finalPrice);
  if("manager" in body) patch.manager=text(body.manager,100); if("master" in body) patch.master=text(body.master,100); if("comment" in body) patch.comment=text(body.comment,2000);
  const {data,error}=await admin.from("ma_crm_repairs").update(patch).eq("id",id).select("*,customer:ma_crm_customers(id,name,phone)").single(); if(error) throw error; return {ok:true,repair:data};
}
async function setStatus(req:Request,body:any){
  const actor=await requireAuth(req),id=text(body.id,80),status=text(body.status,40); if(!id||!STATUSES.has(status)) throw new Error("Неверный статус");
  const {data:old,error:readError}=await admin.from("ma_crm_repairs").select("status").eq("id",id).single(); if(readError) throw readError; if(old.status===status) return {ok:true,unchanged:true};
  const now=new Date().toISOString(),patch:any={status,updated_by:actor.employee,updated_at:now}; if(status==="ready") patch.ready_at=now; if(status==="issued") patch.issued_at=now;
  const {data,error}=await admin.from("ma_crm_repairs").update(patch).eq("id",id).select("*,customer:ma_crm_customers(id,name,phone)").single(); if(error) throw error;
  await admin.from("ma_crm_repair_status_history").insert({repair_id:id,old_status:old.status,new_status:status,changed_by:actor.employee}); return {ok:true,repair:data};
}
async function listSales(req:Request,body:any){
  await requireAuth(req);
  const {data,error}=await admin.from("ma_crm_sales").select("*,customer:ma_crm_customers(id,name,phone,phone_normalized)").order("sold_at",{ascending:false}).limit(200); if(error) throw error;
  let rows:any[]=data||[]; const q=text(body.q,120).toLowerCase(); if(q){ const digits=q.replace(/\D/g,""); rows=rows.filter(r=>[r.sale_no,r.device,r.model,r.imei,r.manager,r.customer?.name,r.customer?.phone].join(" ").toLowerCase().includes(q)||(digits&&String(r.customer?.phone_normalized||"").includes(digits))); }
  return {ok:true,sales:rows.slice(0,150)};
}
async function createSale(req:Request,body:any){
  const actor=await requireAuth(req),customer=await upsertCustomer(body.customerName,body.phone),service=text(body.service,100),model=text(body.model,160); if(!service) throw new Error("Выбери точку"); if(!model) throw new Error("Укажи модель");
  const payload={customer_id:customer.id,service,device:text(body.device||"Телефон",100),model,imei:text(body.imei,80),purchase_price:money(body.purchasePrice),sale_price:money(body.salePrice),manager:text(body.manager||actor.employee,100),comment:text(body.comment,2000),created_by:actor.employee};
  const {data,error}=await admin.from("ma_crm_sales").insert(payload).select("*,customer:ma_crm_customers(id,name,phone)").single(); if(error) throw error;
  return {ok:true,sale:{...data,profit:Number(data.sale_price||0)-Number(data.purchase_price||0)}};
}
async function setEmployeePin(req:Request,body:any){
  const actor=await readAdmin(req); if(!actor) throw new Error("Только администратор может назначать PIN");
  const employee=text(body.employee,80),pin=String(body.pin||""); if(!employee||!/^\d{4}$/.test(pin)) throw new Error("Укажи сотрудника и PIN из 4 цифр");
  const {data:cfg}=await admin.from("ma_schedule_config").select("settings").eq("id","main").maybeSingle(); const names=new Set((cfg?.settings?.employeeSchedules||[]).filter((x:any)=>x?.name&&!x?.inactive).map((x:any)=>String(x.name))); if(!names.has(employee)) throw new Error("Сотрудник не найден в текущем графике");
  const {data:existing}=await admin.from("ma_employee_pins").select("role").eq("employee",employee).maybeSingle();
  const {error}=await admin.from("ma_employee_pins").upsert({employee,role:existing?.role||"manager",pin_hash:await hashPin(pin),active:true,updated_at:new Date().toISOString()},{onConflict:"employee"}); if(error) throw error; return {ok:true,employee};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders}); if(req.method!=="POST") return json({ok:false,error:"POST only"},405);
  try{
    const body=await req.json().catch(()=>({})),op=text(body.op,60);
    if(op==="login") return json(await login(body)); if(op==="bootstrap") return json(await bootstrap(req)); if(op==="list-repairs") return json(await listRepairs(req,body)); if(op==="repair") return json(await repairDetail(req,body));
    if(op==="create-repair") return json(await createRepair(req,body)); if(op==="update-repair") return json(await updateRepair(req,body)); if(op==="set-status") return json(await setStatus(req,body)); if(op==="list-sales") return json(await listSales(req,body));
    if(op==="create-sale") return json(await createSale(req,body)); if(op==="set-employee-pin") return json(await setEmployeePin(req,body)); return json({ok:false,error:"Неизвестная операция"},400);
  }catch(e:any){ console.error("ma-crm-api",e); const msg=e?.message||"Ошибка CRM",status=/Нужен вход|Только администратор/i.test(msg)?403:/заблокирован/i.test(msg)?429:400; return json({ok:false,error:msg},status); }
});
