import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-crm-session",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL=(Deno.env.get("ADMIN_EMAIL")||"bul782@mail.ru").toLowerCase();
const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});}
function text(v:unknown,max=500){return String(v??"").trim().slice(0,max);}
function decimal(v:unknown,max=1000000000){const n=Number(String(v??0).replace(/\s/g,"").replace(",","."));if(!Number.isFinite(n)||n<0||n>max)throw new Error("Неверное числовое значение");return Math.round(n*100)/100;}
function positive(v:unknown,max=1000000000){const n=decimal(v,max);if(n<=0)throw new Error("Сумма должна быть больше нуля");return n;}
function dateOr(v:unknown,fallback:string){const raw=text(v,80);if(!raw)return fallback;const d=new Date(raw);if(Number.isNaN(d.getTime()))throw new Error("Неверная дата");return d.toISOString();}
function startOfMonthIso(){const d=new Date();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1,0,0,0)).toISOString();}
function nowIso(){return new Date().toISOString();}
function round(n:number){return Math.round((Number(n)||0)*100)/100;}

async function readAdmin(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const {data,error}=await db.auth.getUser(token);
  if(error||!data.user||data.user.email?.toLowerCase()!==ADMIN_EMAIL)return null;
  return {kind:"admin",employee:"Администратор",email:data.user.email||ADMIN_EMAIL};
}
async function requireAdmin(req:Request){const actor=await readAdmin(req);if(!actor)throw new Error("Финансы доступны только администратору");return actor;}
async function serviceList(){const {data}=await db.from("ma_schedule_config").select("settings").eq("id","main").maybeSingle();const s:any=data?.settings||{};return [...new Set([String(s.service1||"Моба").trim(),String(s.service2||"Нова").trim()].filter(Boolean))];}
async function ensureCashboxes(actor:string){
  const services=await serviceList();
  const defaults=[{name:"Наличные",kind:"cash"},{name:"Карта",kind:"card"},{name:"Переводы",kind:"transfer"},{name:"Другое",kind:"other"}];
  const rows=services.flatMap(service=>defaults.map(x=>({service,name:x.name,kind:x.kind,opening_balance:0,active:true,created_by:actor,updated_at:nowIso()})));
  if(rows.length){const {error}=await db.from("ma_crm_cashboxes").upsert(rows,{onConflict:"service,name",ignoreDuplicates:true});if(error)throw error;}
  const {data,error}=await db.from("ma_crm_cashboxes").select("*").order("service").order("name");if(error)throw error;return data||[];
}
function cashboxFor(cashboxes:any[],service:string,method:string){const kind=method==="card"?"card":method==="transfer"?"transfer":method==="other"?"other":"cash";return cashboxes.find(c=>c.active&&c.service===service&&c.kind===kind)||null;}
async function autoAssignRepairPayments(cashboxes:any[]){
  const {data,error}=await db.from("ma_crm_payments").select("id,method,cashbox_id,repair:ma_crm_repairs(service)").is("cashbox_id",null).limit(1000);
  if(error)throw error;
  for(const row of data||[]){const service=String((row as any).repair?.service||"");const box=cashboxFor(cashboxes,service,String((row as any).method||"cash"));if(box){await db.from("ma_crm_payments").update({cashbox_id:box.id}).eq("id",(row as any).id).is("cashbox_id",null);}}
}
async function bootstrap(req:Request){const actor=await requireAdmin(req);const cashboxes=await ensureCashboxes(actor.employee);await autoAssignRepairPayments(cashboxes);return {ok:true,actor,services:await serviceList(),cashboxes};}

async function loadFinanceData(from:string,to:string){
  const [cashboxesRes,manualRes,paymentsRes,salesRes,repairsRes,itemsRes]=await Promise.all([
    db.from("ma_crm_cashboxes").select("*").order("service").order("name"),
    db.from("ma_crm_finance_transactions").select("*,cashbox:ma_crm_cashboxes(id,name,service,kind)").gte("occurred_at",from).lte("occurred_at",to).order("occurred_at",{ascending:false}).limit(3000),
    db.from("ma_crm_payments").select("*,cashbox:ma_crm_cashboxes(id,name,service,kind),repair:ma_crm_repairs(id,order_no,service,manager,master,final_price,estimated_price,customer:ma_crm_customers(name,phone))").gte("created_at",from).lte("created_at",to).order("created_at",{ascending:false}).limit(3000),
    db.from("ma_crm_sales").select("*,cashbox:ma_crm_cashboxes(id,name,service,kind),customer:ma_crm_customers(name,phone)").gte("sold_at",from).lte("sold_at",to).order("sold_at",{ascending:false}).limit(3000),
    db.from("ma_crm_repairs").select("id,order_no,service,manager,master,status,estimated_price,final_price,accepted_at,issued_at,customer:ma_crm_customers(name,phone)").order("accepted_at",{ascending:false}).limit(5000),
    db.from("ma_crm_repair_items").select("repair_id,item_type,quantity,unit_price,unit_cost").limit(10000),
  ]);
  for(const r of [cashboxesRes,manualRes,paymentsRes,salesRes,repairsRes,itemsRes])if(r.error)throw r.error;
  return {cashboxes:cashboxesRes.data||[],manual:manualRes.data||[],payments:paymentsRes.data||[],sales:salesRes.data||[],repairs:repairsRes.data||[],items:itemsRes.data||[]};
}
function signedManual(x:any){return x.kind==="expense"||x.kind==="transfer_out"?-Number(x.amount||0):Number(x.amount||0);}
function signedPayment(x:any){return x.kind==="refund"?-Number(x.amount||0):Number(x.amount||0);}
function repairEconomics(repair:any,items:any[],allPayments:any[]){
  const its=items.filter(x=>x.repair_id===repair.id);
  const itemsTotal=round(its.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.unit_price||0),0));
  const partsCost=round(its.filter(x=>x.item_type==="part").reduce((s,x)=>s+Number(x.quantity||0)*Number(x.unit_cost||0),0));
  const total=its.length?itemsTotal:Number(repair.final_price??repair.estimated_price??0);
  const paid=round(allPayments.filter(x=>x.repair_id===repair.id).reduce((s,x)=>s+signedPayment(x),0));
  return {total:round(total),paid,partsCost,profit:round(total-partsCost),balance:round(total-paid)};
}
async function summary(req:Request,body:any){
  await requireAdmin(req);const from=dateOr(body.from,startOfMonthIso()),to=dateOr(body.to,nowIso());const d=await loadFinanceData(from,to);
  const balances:any[]=[];
  for(const box of d.cashboxes){
    const manual=d.manual.filter(x=>x.cashbox_id===box.id).reduce((s,x)=>s+signedManual(x),0);
    const repair=d.payments.filter(x=>x.cashbox_id===box.id).reduce((s,x)=>s+signedPayment(x),0);
    const sales=d.sales.filter(x=>x.cashbox_id===box.id).reduce((s,x)=>s+Number(x.sale_price||0),0);
    balances.push({...box,balance:round(Number(box.opening_balance||0)+manual+repair+sales)});
  }
  const repairIncome=round(d.payments.filter(x=>x.kind==="payment").reduce((s,x)=>s+Number(x.amount||0),0));
  const refunds=round(d.payments.filter(x=>x.kind==="refund").reduce((s,x)=>s+Number(x.amount||0),0));
  const salesIncome=round(d.sales.reduce((s,x)=>s+Number(x.sale_price||0),0));
  const manualIncome=round(d.manual.filter(x=>x.kind==="income").reduce((s,x)=>s+Number(x.amount||0),0));
  const expenses=round(d.manual.filter(x=>x.kind==="expense").reduce((s,x)=>s+Number(x.amount||0),0));
  const allPaymentsRes=await db.from("ma_crm_payments").select("repair_id,kind,amount").limit(10000);if(allPaymentsRes.error)throw allPaymentsRes.error;const allPayments=allPaymentsRes.data||[];
  const debtRows=d.repairs.map(r=>({...r,economics:repairEconomics(r,d.items,allPayments)})).filter((r:any)=>Math.abs(r.economics.balance)>0.009);
  const debtTotal=round(debtRows.filter((r:any)=>r.economics.balance>0).reduce((s:number,r:any)=>s+r.economics.balance,0));
  const prepaymentTotal=round(debtRows.filter((r:any)=>r.economics.balance<0).reduce((s:number,r:any)=>s+Math.abs(r.economics.balance),0));
  const issued=d.repairs.filter(r=>r.issued_at&&new Date(r.issued_at)>=new Date(from)&&new Date(r.issued_at)<=new Date(to));
  const repairGross=round(issued.reduce((s,r)=>s+repairEconomics(r,d.items,allPayments).profit,0));
  const salesMargin=round(d.sales.reduce((s,x)=>s+(Number(x.sale_price||0)-Number(x.purchase_price||0)),0));
  const operatingProfit=round(repairGross+salesMargin+manualIncome-expenses-refunds);
  return {ok:true,from,to,cashboxes:balances,metrics:{cashTotal:round(balances.reduce((s,x)=>s+x.balance,0)),income:round(repairIncome+salesIncome+manualIncome),expenses:round(expenses+refunds),debtTotal,prepaymentTotal,repairGross,salesMargin,operatingProfit,unassignedSales:d.sales.filter(x=>!x.cashbox_id).length}};
}

async function transactions(req:Request,body:any){
  await requireAdmin(req);const from=dateOr(body.from,startOfMonthIso()),to=dateOr(body.to,nowIso());const d=await loadFinanceData(from,to);const rows:any[]=[];
  for(const x of d.manual)rows.push({id:x.id,source:"manual",date:x.occurred_at,kind:x.kind,category:x.category||"Операция",amount:signedManual(x),cashbox:x.cashbox,service:x.service,employee:x.employee,note:x.note});
  for(const x of d.payments)rows.push({id:x.id,source:"repair",date:x.created_at,kind:x.kind==="refund"?"refund":"income",category:x.kind==="refund"?"Возврат по ремонту":"Оплата ремонта",amount:signedPayment(x),cashbox:x.cashbox,service:(x as any).repair?.service||"",employee:x.created_by,note:`Заказ №${(x as any).repair?.order_no||"—"}${x.note?` · ${x.note}`:""}`});
  for(const x of d.sales)rows.push({id:x.id,source:"sale",date:x.sold_at,kind:"income",category:"Продажа техники",amount:Number(x.sale_price||0),cashbox:x.cashbox,service:x.service,employee:x.manager,note:`Продажа №${x.sale_no} · ${[x.device,x.model].filter(Boolean).join(" ")}`});
  rows.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());return {ok:true,transactions:rows.slice(0,500)};
}

async function debts(req:Request){
  await requireAdmin(req);const [repairsRes,itemsRes,paymentsRes]=await Promise.all([
    db.from("ma_crm_repairs").select("id,order_no,service,manager,master,status,estimated_price,final_price,accepted_at,issued_at,customer:ma_crm_customers(name,phone)").order("accepted_at",{ascending:false}).limit(5000),
    db.from("ma_crm_repair_items").select("repair_id,item_type,quantity,unit_price,unit_cost").limit(10000),
    db.from("ma_crm_payments").select("repair_id,kind,amount").limit(10000),
  ]);for(const r of [repairsRes,itemsRes,paymentsRes])if(r.error)throw r.error;
  const rows=(repairsRes.data||[]).map(r=>({...r,economics:repairEconomics(r,itemsRes.data||[],paymentsRes.data||[])})).filter((r:any)=>Math.abs(r.economics.balance)>0.009).sort((a:any,b:any)=>Math.abs(b.economics.balance)-Math.abs(a.economics.balance));return {ok:true,rows};
}

async function repairProfit(req:Request,body:any){
  await requireAdmin(req);const from=dateOr(body.from,startOfMonthIso()),to=dateOr(body.to,nowIso());
  const [repairsRes,itemsRes,paymentsRes]=await Promise.all([
    db.from("ma_crm_repairs").select("id,order_no,service,manager,master,status,estimated_price,final_price,accepted_at,issued_at,customer:ma_crm_customers(name,phone)").gte("accepted_at",from).lte("accepted_at",to).order("accepted_at",{ascending:false}).limit(5000),
    db.from("ma_crm_repair_items").select("repair_id,item_type,quantity,unit_price,unit_cost").limit(10000),
    db.from("ma_crm_payments").select("repair_id,kind,amount").limit(10000),
  ]);for(const r of [repairsRes,itemsRes,paymentsRes])if(r.error)throw r.error;
  const rows=(repairsRes.data||[]).map(r=>({...r,economics:repairEconomics(r,itemsRes.data||[],paymentsRes.data||[])}));return {ok:true,rows};
}

async function reports(req:Request,body:any){
  await requireAdmin(req);const from=dateOr(body.from,startOfMonthIso()),to=dateOr(body.to,nowIso());const d=await loadFinanceData(from,to);const allPaymentsRes=await db.from("ma_crm_payments").select("repair_id,kind,amount").limit(10000);if(allPaymentsRes.error)throw allPaymentsRes.error;const allPayments=allPaymentsRes.data||[];
  const services=await serviceList();const byService=services.map(service=>{
    const issued=d.repairs.filter(r=>r.service===service&&r.issued_at&&new Date(r.issued_at)>=new Date(from)&&new Date(r.issued_at)<=new Date(to));
    const repairRevenue=round(issued.reduce((s,r)=>s+repairEconomics(r,d.items,allPayments).total,0));const partsCost=round(issued.reduce((s,r)=>s+repairEconomics(r,d.items,allPayments).partsCost,0));
    const sales=d.sales.filter(x=>x.service===service),salesRevenue=round(sales.reduce((s,x)=>s+Number(x.sale_price||0),0)),salesMargin=round(sales.reduce((s,x)=>s+Number(x.sale_price||0)-Number(x.purchase_price||0),0));
    const expenses=round(d.manual.filter(x=>x.service===service&&x.kind==="expense").reduce((s,x)=>s+Number(x.amount||0),0));
    return {service,repairRevenue,partsCost,salesRevenue,salesMargin,expenses,profit:round((repairRevenue-partsCost)+salesMargin-expenses)};
  });
  const people=new Map<string,any>();
  for(const r of d.repairs){if(!r.master)continue;const e=repairEconomics(r,d.items,allPayments),key=`master:${r.master}`,cur=people.get(key)||{employee:r.master,role:"Мастер",orders:0,revenue:0,profit:0};cur.orders++;cur.revenue=round(cur.revenue+e.total);cur.profit=round(cur.profit+e.profit);people.set(key,cur);}
  for(const s of d.sales){if(!s.manager)continue;const key=`manager:${s.manager}`,cur=people.get(key)||{employee:s.manager,role:"Менеджер",orders:0,revenue:0,profit:0};cur.orders++;cur.revenue=round(cur.revenue+Number(s.sale_price||0));cur.profit=round(cur.profit+Number(s.sale_price||0)-Number(s.purchase_price||0));people.set(key,cur);}
  return {ok:true,byService,byEmployee:[...people.values()].sort((a,b)=>b.profit-a.profit)};
}

async function createCashbox(req:Request,body:any){const actor=await requireAdmin(req);const name=text(body.name,120),service=text(body.service,100),kind=text(body.kind,30)||"cash";if(!name)throw new Error("Укажи название кассы");if(!["cash","card","transfer","bank","safe","other"].includes(kind))throw new Error("Неверный тип кассы");if(service&&!((await serviceList()).includes(service)))throw new Error("Неизвестная точка");const {data,error}=await db.from("ma_crm_cashboxes").insert({name,service,kind,opening_balance:decimal(body.openingBalance),active:true,created_by:actor.employee}).select("*").single();if(error){if(error.code==="23505")throw new Error("Такая касса уже существует");throw error;}return {ok:true,cashbox:data};}
async function addTransaction(req:Request,body:any){const actor=await requireAdmin(req),cashboxId=text(body.cashboxId,80),kind=text(body.kind,20);if(!cashboxId)throw new Error("Выбери кассу");if(kind!=="income"&&kind!=="expense")throw new Error("Неверный тип операции");const {data:box,error:boxError}=await db.from("ma_crm_cashboxes").select("id,service,active").eq("id",cashboxId).single();if(boxError||!box?.active)throw new Error("Касса не найдена");const payload={cashbox_id:cashboxId,kind,category:text(body.category,120)|| (kind==="income"?"Прочий доход":"Прочий расход"),amount:positive(body.amount),service:box.service||"",employee:text(body.employee,120),note:text(body.note,500),occurred_at:dateOr(body.occurredAt,nowIso()),created_by:actor.employee};const {data,error}=await db.from("ma_crm_finance_transactions").insert(payload).select("*").single();if(error)throw error;return {ok:true,transaction:data};}
async function transfer(req:Request,body:any){const actor=await requireAdmin(req);const {data,error}=await db.rpc("ma_crm_finance_transfer",{p_from_cashbox:text(body.fromCashboxId,80),p_to_cashbox:text(body.toCashboxId,80),p_amount:positive(body.amount),p_actor:actor.employee,p_note:text(body.note,500)});if(error)throw error;return {ok:true,result:data};}
async function assignPayment(req:Request,body:any){await requireAdmin(req);const id=text(body.id,80),cashboxId=text(body.cashboxId,80);if(!id||!cashboxId)throw new Error("Не указана операция");const {data,error}=await db.from("ma_crm_payments").update({cashbox_id:cashboxId}).eq("id",id).select("id,cashbox_id").single();if(error)throw error;return {ok:true,payment:data};}
async function assignSale(req:Request,body:any){await requireAdmin(req);const id=text(body.id,80),cashboxId=text(body.cashboxId,80),method=text(body.method,20)||"cash";if(!id||!cashboxId)throw new Error("Не указана продажа");if(!["cash","card","transfer","other"].includes(method))throw new Error("Неверный способ оплаты");const {data,error}=await db.from("ma_crm_sales").update({cashbox_id:cashboxId,payment_method:method,updated_at:nowIso()}).eq("id",id).select("id,cashbox_id,payment_method").single();if(error)throw error;return {ok:true,sale:data};}
async function unassignedSales(req:Request){await requireAdmin(req);const {data,error}=await db.from("ma_crm_sales").select("id,sale_no,service,manager,sale_price,sold_at,device,model,customer:ma_crm_customers(name,phone)").is("cashbox_id",null).order("sold_at",{ascending:false}).limit(200);if(error)throw error;return {ok:true,sales:data||[]};}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  try{
    const body=await req.json().catch(()=>({})),op=text(body?.op,60);
    if(op==="bootstrap")return json(await bootstrap(req));
    if(op==="summary")return json(await summary(req,body));
    if(op==="transactions")return json(await transactions(req,body));
    if(op==="debts")return json(await debts(req));
    if(op==="repair-profit")return json(await repairProfit(req,body));
    if(op==="reports")return json(await reports(req,body));
    if(op==="create-cashbox")return json(await createCashbox(req,body));
    if(op==="add-transaction")return json(await addTransaction(req,body));
    if(op==="transfer")return json(await transfer(req,body));
    if(op==="assign-payment")return json(await assignPayment(req,body));
    if(op==="assign-sale")return json(await assignSale(req,body));
    if(op==="unassigned-sales")return json(await unassignedSales(req));
    return json({ok:false,error:"Неизвестная операция"},400);
  }catch(e){const message=e instanceof Error?e.message:String(e),status=/только администратору/.test(message)?403:400;console.error("ma-crm-finance-api",message);return json({ok:false,error:message},status);}
});