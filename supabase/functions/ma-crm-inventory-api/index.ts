import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-crm-session",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL=(Deno.env.get("ADMIN_EMAIL")||"bul782@mail.ru").toLowerCase();
const PIN_PEPPER=Deno.env.get("PIN_PEPPER")||"";
const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});
const CATEGORIES=new Set(["part","accessory","device","other"]);

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});}
function text(v:unknown,max=500){return String(v??"").trim().slice(0,max);}
function decimal(v:unknown,max=100000000){const n=Number(String(v??0).replace(/\s/g,"").replace(",","."));if(!Number.isFinite(n)||n<0||n>max)throw new Error("Неверное числовое значение");return Math.round(n*100)/100;}
function positive(v:unknown,max=100000000){const n=decimal(v,max);if(n<=0)throw new Error("Количество должно быть больше нуля");return n;}
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function fromB64url(value:string){const base=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);const raw=atob(base);return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function hmac(value:string){if(!PIN_PEPPER)throw new Error("CRM auth is not configured");const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(PIN_PEPPER),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)));}
async function readSession(req:Request){
  const token=req.headers.get("x-crm-session")||"";const [payload,sig]=token.split(".");if(!payload||!sig)return null;
  const expected=await hmac(payload),actual=fromB64url(sig);if(actual.length!==expected.length)return null;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];if(diff!==0)return null;
  try{const data=JSON.parse(new TextDecoder().decode(fromB64url(payload)));if(!data?.employee||Number(data.exp)<Date.now())return null;const {data:pin}=await db.from("ma_employee_pins").select("employee,active").eq("employee",data.employee).eq("active",true).maybeSingle();return pin?{kind:"staff",employee:String(data.employee)}:null;}catch(_){return null;}
}
async function readAdmin(req:Request){const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return null;const {data,error}=await db.auth.getUser(token);if(error||!data.user||data.user.email?.toLowerCase()!==ADMIN_EMAIL)return null;return {kind:"admin",employee:"Администратор",email:data.user.email||ADMIN_EMAIL};}
async function requireAuth(req:Request){const actor=await readAdmin(req)||await readSession(req);if(!actor)throw new Error("Нужен вход в CRM");return actor;}
async function serviceList(){const {data}=await db.from("ma_schedule_config").select("settings").eq("id","main").maybeSingle();const s:any=data?.settings||{};return [...new Set([String(s.service1||"Моба").trim(),String(s.service2||"Нова").trim()].filter(Boolean))];}
async function ensureService(value:unknown){const service=text(value,100),services=await serviceList();if(!services.includes(service))throw new Error("Неизвестная точка");return service;}
function friendlyDbError(error:any){if(error?.code==="23505")return new Error("Такой артикул уже существует");return error instanceof Error?error:new Error(error?.message||"Ошибка базы данных");}

async function bootstrap(req:Request){const actor=await requireAuth(req);return {ok:true,actor,services:await serviceList()};}
async function listProducts(req:Request,body:any){
  await requireAuth(req);
  const [{data:products,error:productError},{data:stocks,error:stockError}]=await Promise.all([
    db.from("ma_crm_inventory_products").select("*").order("active",{ascending:false}).order("name",{ascending:true}).limit(500),
    db.from("ma_crm_inventory_stock").select("product_id,service,quantity,updated_at").limit(2000),
  ]);
  if(productError)throw friendlyDbError(productError);if(stockError)throw friendlyDbError(stockError);
  let rows=(products||[]).map((p:any)=>({...p,stocks:(stocks||[]).filter((s:any)=>s.product_id===p.id)}));
  const q=text(body.q,120).toLowerCase(),category=text(body.category,30),service=text(body.service,100);
  if(q)rows=rows.filter((p:any)=>`${p.name} ${p.sku||""}`.toLowerCase().includes(q));
  if(category&&CATEGORIES.has(category))rows=rows.filter((p:any)=>p.category===category);
  if(service)rows=rows.filter((p:any)=>p.stocks.some((s:any)=>s.service===service&&Number(s.quantity)>0));
  return {ok:true,services:await serviceList(),products:rows};
}
async function createProduct(req:Request,body:any){
  const actor=await requireAuth(req),name=text(body.name,240),category=text(body.category,30)||"part";if(!name)throw new Error("Укажи название товара");if(!CATEGORIES.has(category))throw new Error("Неверная категория");
  const sku=text(body.sku,100)||null,unit=text(body.unit,30)||"шт";
  const payload={name,sku,category,unit,cost_price:decimal(body.costPrice),sale_price:decimal(body.salePrice),min_stock:decimal(body.minStock,1000000),active:true,created_by:actor.employee,updated_at:new Date().toISOString()};
  const {data,error}=await db.from("ma_crm_inventory_products").insert(payload).select("*").single();if(error)throw friendlyDbError(error);return {ok:true,product:data};
}
async function updateProduct(req:Request,body:any){
  await requireAuth(req);const id=text(body.id,80);if(!id)throw new Error("Товар не указан");const patch:any={updated_at:new Date().toISOString()};
  if("name" in body){patch.name=text(body.name,240);if(!patch.name)throw new Error("Название не может быть пустым");}
  if("sku" in body)patch.sku=text(body.sku,100)||null;
  if("category" in body){patch.category=text(body.category,30);if(!CATEGORIES.has(patch.category))throw new Error("Неверная категория");}
  if("unit" in body)patch.unit=text(body.unit,30)||"шт";
  if("costPrice" in body)patch.cost_price=decimal(body.costPrice);
  if("salePrice" in body)patch.sale_price=decimal(body.salePrice);
  if("minStock" in body)patch.min_stock=decimal(body.minStock,1000000);
  if("active" in body)patch.active=!!body.active;
  const {data,error}=await db.from("ma_crm_inventory_products").update(patch).eq("id",id).select("*").single();if(error)throw friendlyDbError(error);return {ok:true,product:data};
}
async function receive(req:Request,body:any){const actor=await requireAuth(req),service=await ensureService(body.service),productId=text(body.productId,80);if(!productId)throw new Error("Товар не указан");const quantity=positive(body.quantity,1000000),unitCost=decimal(body.unitCost);const {data,error}=await db.rpc("ma_crm_inventory_receive",{p_product_id:productId,p_service:service,p_quantity:quantity,p_unit_cost:unitCost,p_actor:actor.employee,p_note:text(body.note,500)});if(error)throw friendlyDbError(error);return {ok:true,result:data};}
async function writeoff(req:Request,body:any){const actor=await requireAuth(req),service=await ensureService(body.service),productId=text(body.productId,80);if(!productId)throw new Error("Товар не указан");const {data,error}=await db.rpc("ma_crm_inventory_writeoff",{p_product_id:productId,p_service:service,p_quantity:positive(body.quantity,1000000),p_actor:actor.employee,p_note:text(body.note,500)});if(error)throw friendlyDbError(error);return {ok:true,result:data};}
async function transfer(req:Request,body:any){const actor=await requireAuth(req),from=await ensureService(body.fromService),to=await ensureService(body.toService);if(from===to)throw new Error("Точки должны отличаться");const productId=text(body.productId,80);if(!productId)throw new Error("Товар не указан");const {data,error}=await db.rpc("ma_crm_inventory_transfer",{p_product_id:productId,p_from_service:from,p_to_service:to,p_quantity:positive(body.quantity,1000000),p_actor:actor.employee,p_note:text(body.note,500)});if(error)throw friendlyDbError(error);return {ok:true,result:data};}
async function movements(req:Request,body:any){await requireAuth(req);const productId=text(body.productId,80);let q=db.from("ma_crm_inventory_movements").select("*,product:ma_crm_inventory_products(id,name,sku,category)").order("created_at",{ascending:false}).limit(120);if(productId)q=q.eq("product_id",productId);const {data,error}=await q;if(error)throw friendlyDbError(error);return {ok:true,movements:data||[]};}
async function repairOptions(req:Request,body:any){await requireAuth(req);const repairId=text(body.repairId,80);if(!repairId)throw new Error("Заказ не указан");const {data:repair,error:repairError}=await db.from("ma_crm_repairs").select("id,order_no,service").eq("id",repairId).single();if(repairError||!repair)throw new Error("Заказ не найден");const [{data:products,error:productError},{data:stocks,error:stockError}]=await Promise.all([db.from("ma_crm_inventory_products").select("id,name,sku,category,unit,cost_price,sale_price").eq("active",true).eq("category","part").order("name"),db.from("ma_crm_inventory_stock").select("product_id,quantity").eq("service",repair.service).gt("quantity",0)]);if(productError)throw friendlyDbError(productError);if(stockError)throw friendlyDbError(stockError);const byId=new Map((stocks||[]).map((s:any)=>[s.product_id,Number(s.quantity||0)]));const options=(products||[]).filter((p:any)=>byId.has(p.id)).map((p:any)=>({...p,quantity:byId.get(p.id)}));return {ok:true,repair,products:options};}
async function usePart(req:Request,body:any){const actor=await requireAuth(req),repairId=text(body.repairId,80),productId=text(body.productId,80);if(!repairId||!productId)throw new Error("Заказ или товар не указан");const rawPrice=String(body.unitPrice??"").trim(),unitPrice=rawPrice===""?null:decimal(rawPrice);const {data,error}=await db.rpc("ma_crm_inventory_use_for_repair",{p_repair_id:repairId,p_product_id:productId,p_quantity:positive(body.quantity,10000),p_unit_price:unitPrice,p_actor:actor.employee});if(error)throw friendlyDbError(error);return {ok:true,result:data};}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  try{
    const body=await req.json().catch(()=>({})),op=text(body?.op,50);
    if(op==="bootstrap")return json(await bootstrap(req));
    if(op==="list-products")return json(await listProducts(req,body));
    if(op==="create-product")return json(await createProduct(req,body));
    if(op==="update-product")return json(await updateProduct(req,body));
    if(op==="receive")return json(await receive(req,body));
    if(op==="writeoff")return json(await writeoff(req,body));
    if(op==="transfer")return json(await transfer(req,body));
    if(op==="movements")return json(await movements(req,body));
    if(op==="repair-options")return json(await repairOptions(req,body));
    if(op==="use-part")return json(await usePart(req,body));
    return json({ok:false,error:"Неизвестная операция"},400);
  }catch(e){const message=e instanceof Error?e.message:String(e),status=/Нужен вход/.test(message)?403:400;console.error("ma-crm-inventory-api",message);return json({ok:false,error:message},status);}
});