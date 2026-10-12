import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OWNER_EMAIL=(Deno.env.get("ADMIN_EMAIL")||"bul782@mail.ru").toLowerCase();
const admin=createClient(SUPABASE_URL,ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const encoder=new TextEncoder();
async function hash(value:string){const b=await crypto.subtle.digest("SHA-256",encoder.encode(value));return Array.from(new Uint8Array(b)).map(v=>v.toString(16).padStart(2,"0")).join("");}
function token(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
async function assertOwner(req:Request){
 const auth=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 if(!auth)throw new Error("Для настройки нужен вход владельца");
 const {data,error}=await admin.auth.getUser(auth);
 if(error||!data?.user||data.user.email?.toLowerCase()!==OWNER_EMAIL)throw new Error("Нет прав владельца");
}
async function authenticate(req:Request){
 const auth=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 if(auth.length<30||auth.length>512)throw new Error("Нужен вход маркетолога");
 const digest=await hash(auth);
 const {data,error}=await admin.from("ma_marketer_sessions")
   .select("username,expires_at,revoked_at,ma_marketer_accounts!inner(employee_name,role,active)")
   .eq("token_hash",digest).maybeSingle();
 if(error||!data||data.revoked_at||new Date(data.expires_at).getTime()<=Date.now())throw new Error("Сессия истекла. Войди заново");
 const account:any=data.ma_marketer_accounts;
 if(!account?.active||account.role!=="marketer")throw new Error("Доступ отключён");
 return {username:data.username,employee:account.employee_name,digest};
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"Разрешён только POST"},405);
 const body=await req.json().catch(()=>({}));
 const op=String(body.op||"");
 try{
  if(op==="setup"){
   await assertOwner(req);
   if(String(body.username||"").trim().toLowerCase()!=="irma"||String(body.employee||"")!=="Ирма")throw new Error("Некорректная учётная запись");
   if(typeof body.password!=="string"||body.password.length<4||body.password.length>128)throw new Error("Пароль должен содержать минимум 4 символа");
   const {data,error}=await admin.rpc("ma_set_marketer_credentials",{p_username:"irma",p_employee_name:"Ирма",p_password:body.password});
   if(error||data!==true)throw new Error("Не удалось создать учётную запись");
   return json({ok:true,username:"irma",employee:"Ирма",role:"marketer"});
  }
  if(op==="login"){
   const username=String(body.username||"").trim().toLowerCase();
   if(!/^[a-z0-9_]{3,40}$/.test(username)||typeof body.password!=="string"||body.password.length>128)return json({ok:false,error:"Неверный логин или пароль"},401);
   const {data,error}=await admin.rpc("ma_verify_marketer_login",{p_username:username,p_password:body.password});
   if(error||data?.ok!==true) return json({ok:false,error:data?.locked?"Вход временно заблокирован. Попробуйте через 30 минут.":"Неверный логин или пароль"},data?.locked?429:401);
   const bearer=token(),expires=new Date(Date.now()+12*3600000).toISOString();
   const {error:writeError}=await admin.from("ma_marketer_sessions").insert({token_hash:await hash(bearer),username,expires_at:expires});
   if(writeError)throw writeError;
   return json({ok:true,token:bearer,expiresAt:expires,username,employee:data.employee,role:"marketer"});
  }
  if(op==="status"){
   const a=await authenticate(req);
   return json({ok:true,username:a.username,employee:a.employee,role:"marketer"});
  }
  if(op==="logout"){
   const a=await authenticate(req);
   const {error}=await admin.from("ma_marketer_sessions").update({revoked_at:new Date().toISOString()}).eq("token_hash",a.digest);
   if(error)throw error;
   return json({ok:true});
  }
  if(op==="reports"){
   const a=await authenticate(req);
   const days=Math.max(1,Math.min(90,Number(body.days)||30));
   const since=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
   const {data,error}=await admin.from("ma_shift_daily_reports")
     .select("shift_id,total_appeals,reasons,reported_by,submitted_at,ma_shifts!inner(shift_date,service,opened_by,closed_by,closed_at)")
     .gte("ma_shifts.shift_date",since)
     .order("submitted_at",{ascending:false}).limit(300);
   if(error)throw error;
   return json({ok:true,employee:a.employee,days,reports:(data||[]).map((record:any)=>{
    const shift=record.ma_shifts||{};
    return {date:shift.shift_date,service:shift.service,totalAppeals:record.total_appeals,reasons:record.reasons,reportedBy:record.reported_by,submittedAt:record.submitted_at,closedAt:shift.closed_at};
   })});
  }
  return json({ok:false,error:"Неизвестное действие"},400);
 }catch(error:any){
  const message=String(error?.message||"Ошибка").slice(0,200);
  const status=/вход|сессия|нет прав|доступ/i.test(message)?403:400;
  return json({ok:false,error:message},status);
 }
});
