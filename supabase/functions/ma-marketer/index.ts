import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!SUPABASE_URL||!SERVICE_ROLE) throw new Error("Supabase credentials are not configured");
const admin=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"no-store"};
const encoder=new TextEncoder();
const TTL_MS=8*60*60*1000;
function reply(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json"}});}
function encodeBase64Url(bytes:Uint8Array){let raw="";for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function decodeBase64Url(raw:string){const value=raw.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(value+"=".repeat((4-value.length%4)%4)),ch=>ch.charCodeAt(0));}
let signingKey:CryptoKey|null=null;
async function getSigningKey(){
  if(!signingKey) signingKey=await crypto.subtle.importKey("raw",encoder.encode("ma-marketer-v1|"+SERVICE_ROLE),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  return signingKey;
}
async function issueToken(username:string){
  const expiresAt=Date.now()+TTL_MS;
  const payload=encodeBase64Url(encoder.encode(JSON.stringify({sub:username,scope:"marketer_reports",exp:expiresAt})));
  const sig=new Uint8Array(await crypto.subtle.sign("HMAC",await getSigningKey(),encoder.encode(payload)));
  return {token:payload+"."+encodeBase64Url(sig),expiresAt};
}
async function checkToken(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const parts=token.split(".");
  if(parts.length!==2 || parts[0].length>300 || parts[1].length>150) throw new Error("Требуется вход Ирмы");
  let payload:any;
  try {
    const ok=await crypto.subtle.verify("HMAC",await getSigningKey(),decodeBase64Url(parts[1]),encoder.encode(parts[0]));
    if(!ok) throw new Error("Invalid signature");
    payload=JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
  }catch(_){throw new Error("Сессия недействительна. Войди снова");}
  if(payload.scope!=="marketer_reports" || typeof payload.sub!=="string" || !Number.isSafeInteger(payload.exp) || payload.exp<=Date.now()) throw new Error("Сессия истекла. Войди снова");
  const {data,error}=await admin.from("ma_marketer_accounts").select("username,employee_name,role,active").eq("username",payload.sub).maybeSingle();
  if(error) throw error;
  if(!data?.active || data.role!=="marketer") throw new Error("Доступ к отчётам отключён");
  return data;
}
function validDate(v:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+"T12:00:00Z");
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function dateUTC(d:Date){return d.toISOString().slice(0,10);}
function clampRange(body:any){
  const today=new Date();
  const monthAgo=new Date(today.getTime()-29*86400000);
  const from=String(body.from||dateUTC(monthAgo));
  const to=String(body.to||dateUTC(today));
  if(!validDate(from)||!validDate(to)||from>to) throw new Error("Некорректный период отчёта");
  const span=(Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000;
  if(span>180) throw new Error("Выбери период не более 180 дней");
  const service=String(body.service||"").trim();
  if(service && !["Моба","Нова"].includes(service)) throw new Error("Неизвестный сервис");
  return {from,to,service};
}
async function login(body:any){
  const username=String(body.username||"").toLowerCase().trim();
  const password=String(body.password||"");
  if(!/^[a-z0-9_]{3,40}$/.test(username) || password.length<4 || password.length>128) throw new Error("Неправильный логин или пароль");
  const {data,error}=await admin.rpc("ma_verify_marketer_login",{p_username:username,p_password:password});
  if(error) throw error;
  if(!data?.ok){if(data?.locked) throw new Error("Слишком много попыток. Повтори вход через 30 минут");throw new Error("Неправильный логин или пароль");}
  const session=await issueToken(data.username);
  return {ok:true,...session,username:data.username,employee:data.employee,role:data.role};
}
async function reports(req:Request,body:any){
  const account=await checkToken(req);
  const {from,to,service}=clampRange(body);
  let query=admin.from("ma_shift_daily_reports")
    .select("shift_id,total_appeals,reasons,reported_by,submitted_at,ma_shifts!inner(service,shift_date,closed_at,closed_by)")
    .gte("ma_shifts.shift_date",from).lte("ma_shifts.shift_date",to)
    .order("submitted_at",{ascending:false}).limit(400);
  if(service) query=query.eq("ma_shifts.service",service);
  const {data,error}=await query;
  if(error) throw error;
  return {ok:true,employee:account.employee_name,from,to,reports:(data||[]).map((r:any)=>{
    const shift=Array.isArray(r.ma_shifts)?r.ma_shifts[0]:r.ma_shifts;
    return {shiftId:r.shift_id,date:shift?.shift_date,service:shift?.service,closedBy:shift?.closed_by,reportedBy:r.reported_by,totalAppeals:r.total_appeals,reasons:r.reasons,submittedAt:r.submitted_at};
  })};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({ok:false,error:"Только POST"},405);
  try{
    const body=await req.json().catch(()=>({}));
    if(body.action==="login")return reply(await login(body));
    if(body.action==="reports")return reply(await reports(req,body));
    if(body.action==="profile"){const a=await checkToken(req);return reply({ok:true,username:a.username,employee:a.employee_name,role:a.role});}
    return reply({ok:false,error:"Неизвестная операция"},404);
  }catch(e:any){
    const message=e?.message||"Ошибка сервера";
    const status=/Сессия|Требуется вход|Доступ|истекла/.test(message)?401:400;
    return reply({ok:false,error:message},status);
  }
});
