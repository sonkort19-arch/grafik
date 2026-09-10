import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Один источник расчёта графика: тот же schedule.js, который использует веб-приложение.
if (!("window" in globalThis)) {
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
}
await import("https://raw.githubusercontent.com/sonkort19-arch/grafik/main/schedule.js");
const SharedSchedule:any = (globalThis as any).MASchedule || (globalThis as any).window?.MASchedule;
if (!SharedSchedule?.create) throw new Error("Не удалось загрузить общий расчёт графика");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "bul782@mail.ru").toLowerCase();
const PIN_PEPPER = Deno.env.get("PIN_PEPPER") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:bul782@mail.ru";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const TZ = "Europe/Moscow";
const MASTER_ROSTER_FROM = "2026-08-24";
const MANAGER_ROSTER_FROM = "2026-09-07";
const REMOVED_MANAGER_NAME = "Сергей";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false, autoRefreshToken:false } });
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}
function localParts(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(date);
  const o:Record<string,string>={};
  for(const p of parts) if(p.type!=="literal") o[p.type]=p.value;
  return {date:`${o.year}-${o.month}-${o.day}`,time:`${o.hour}:${o.minute}`,hour:Number(o.hour),minute:Number(o.minute)};
}
function mins(t:string){
  const [h,m]=String(t||"00:00").split(":").map(Number);
  return (Number.isFinite(h)?h:0)*60+(Number.isFinite(m)?m:0);
}
function serviceShiftTimes(s:any,service:string){
  const service2=String(s?.service2||"Нова");
  if(service===service2) return {start:String(s?.novaShiftStart||"09:00"),end:String(s?.novaShiftEnd||"19:00")};
  return {start:String(s?.shiftStart||"08:00"),end:String(s?.shiftEnd||"22:00")};
}

function dateObjectFromKey(key:string){
  const [y,m,d]=String(key).split("-").map(Number);
  return new Date(y,m-1,d);
}
function sharedScheduleForSettings(s:any){
  return SharedSchedule.create({
    getSettings:()=>s||{},
    anchorParts:()=>{
      const [year,month,day]=String(s?.anchorDate||"2026-09-01").split("-").map(Number);
      return {year,month:month-1,day};
    },
    monthInfo:(index:number)=>{
      const year=Math.floor(index/12);
      const month=index-year*12;
      return {year,month};
    },
    serviceKeyForName:(name:string)=>name===s?.service1?"s1":name===s?.service2?"s2":"",
    dateObjectFromKey,
    MASTER_ROSTER_FROM,
    MANAGER_ROSTER_FROM,
    REMOVED_MANAGER_NAME
  });
}
function scheduleForDate(s:any,dateStr:string){
  const [y,m,d]=String(dateStr||"").split("-").map(Number);
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||m<1||m>12||d<1||d>31) return {} as Record<string,any>;
  const row=sharedScheduleForSettings(s).daySchedule(y*12+(m-1),d);
  const service1=String(s?.service1||"Моба");
  const service2=String(s?.service2||"Нова");
  return {
    [service1]:row?.s1 ? {manager:row.s1.manager,master:row.s1.master} : null,
    [service2]:row?.s2 ? {manager:row.s2.manager,master:row.s2.master} : null
  };
}
function employeeWorkForDate(s:any,employee:string,dateStr:string){
  const schedule=scheduleForDate(s,dateStr);
  for(const [service,pair] of Object.entries(schedule) as [string,any][]){
    if(!pair) continue;
    if(pair.manager===employee || pair.master===employee){
      return {service,pair,partner:pair.manager===employee?pair.master:pair.manager};
    }
  }
  return null;
}

async function hashPin(pin:string){
  const bytes=new TextEncoder().encode(`${PIN_PEPPER}|${pin}`);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function hashDeviceToken(token:string){
  const bytes=new TextEncoder().encode(`${PIN_PEPPER}|device|${token}`);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randomDeviceToken(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s="";
  for(const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function base64UrlToBytes(value:string){
  const base=value.replace(/-/g,"+").replace(/_/g,"/");
  const padded=base+"=".repeat((4-base.length%4)%4);
  const raw=atob(padded);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function verifyDeviceSignature(publicKeyJwk:any,message:string,signature:string){
  if(!publicKeyJwk || !signature) return false;
  try{
    const key=await crypto.subtle.importKey("jwk",publicKeyJwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    return await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,base64UrlToBytes(signature),new TextEncoder().encode(message));
  }catch(e){
    console.error("device signature verify",e);
    return false;
  }
}
function validProofTimestamp(value:any){
  const ts=Number(value);
  return Number.isFinite(ts) && Math.abs(Date.now()-ts)<=90_000;
}
async function getAdminIfValid(req:Request){
  const h=req.headers.get("authorization")||"";
  const token=h.replace(/^Bearer\s+/i,"");
  if(!token) return null;
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user||data.user.email?.toLowerCase()!==ADMIN_EMAIL) return null;
  return data.user;
}
async function assertAdmin(req:Request){
  const h=req.headers.get("authorization")||"";
  const token=h.replace(/^Bearer\s+/i,"");
  if(!token) throw new Error("Нужен вход администратора");
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user||data.user.email?.toLowerCase()!==ADMIN_EMAIL) throw new Error("Нет прав администратора");
  return data.user;
}
async function verifyPin(employee:string,pin:string){
  const {data:guard}=await admin.from("ma_pin_guard").select("*").eq("employee",employee).maybeSingle();
  if(guard?.locked_until && new Date(guard.locked_until)>new Date()) throw new Error("PIN временно заблокирован после нескольких ошибок. Попробуй позже.");
  const {data:row}=await admin.from("ma_employee_pins").select("pin_hash,active,role").eq("employee",employee).maybeSingle();
  if(!row||!row.active||row.role!=="manager") throw new Error("Для этого менеджера PIN ещё не настроен");
  const ok=(await hashPin(pin))===row.pin_hash;
  if(ok){
    await admin.from("ma_pin_guard").upsert({employee,failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()});
    return true;
  }
  const failures=(guard?.failed_attempts||0)+1;
  const lock=failures>=5?new Date(Date.now()+15*60*1000).toISOString():null;
  await admin.from("ma_pin_guard").upsert({employee,failed_attempts:lock?0:failures,locked_until:lock,updated_at:new Date().toISOString()});
  throw new Error(lock?"5 неверных PIN. Вход заблокирован на 15 минут":"Неверный PIN");
}

async function sendWebPush(row:any,payload:any){
  try{
    await webpush.sendNotification(row.subscription,JSON.stringify(payload));
    return true;
  }catch(e:any){
    const code=e?.statusCode||e?.status;
    if(code===404||code===410){
      await admin.from("ma_push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("id",row.id);
    }else console.error("push",e);
    return false;
  }
}
async function sendPush(title:string,body:string,tag="ma-shift"){
  if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY) return 0;
  const {data:subs}=await admin.from("ma_push_subscriptions").select("id,subscription").eq("active",true).eq("audience","admin");
  let sent=0;
  for(const row of subs||[]) if(await sendWebPush(row,{title,body,tag,url:"./"})) sent++;
  return sent;
}
async function sendPushToEmployee(employee:string,title:string,body:string,tag:string){
  if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY) return 0;
  const {data:subs}=await admin.from("ma_push_subscriptions").select("id,subscription").eq("active",true).eq("audience","employee").eq("employee",employee);
  let sent=0;
  for(const row of subs||[]) if(await sendWebPush(row,{title,body,tag,url:"./",employeeReminder:true,sticky:true})) sent++;
  return sent;
}
async function loadScheduleSettings(){
  const {data:cfg,error}=await admin.from("ma_schedule_config").select("settings").eq("id","main").maybeSingle();
  if(error) throw error;
  return cfg?.settings||{};
}
async function configuredEmployeeNames(settingsOverride?:any){
  const s=settingsOverride||await loadScheduleSettings();
  const names:string[]=[];
  for(const emp of s.employeeSchedules||[]) if(emp?.name && !emp?.inactive) names.push(String(emp.name));
  for(const n of [...(s.managers||[]).flat(),...(s.masters||[]).flat()]) if(n) names.push(String(n));
  for(const ch of s.staffChanges||[]){ if(ch?.oldName) names.push(String(ch.oldName)); if(ch?.newName) names.push(String(ch.newName)); }
  for(const o of s.dayOverrides||[]){ if(o?.manager) names.push(String(o.manager)); if(o?.master) names.push(String(o.master)); }
  return new Set(names.filter(Boolean));
}
async function handleSubscribe(req:Request,body:any){
  const user=await assertAdmin(req);
  const sub=body.subscription;
  if(!sub?.endpoint) throw new Error("Нет push-подписки");
  const {data:row,error}=await admin.from("ma_push_subscriptions").upsert({endpoint:sub.endpoint,subscription:sub,user_email:user.email,audience:"admin",employee:null,active:true,updated_at:new Date().toISOString()},{onConflict:"endpoint"}).select("id,subscription").single();
  if(error) throw error;
  await sendWebPush(row,{title:"MA График",body:"Уведомления администратора на этом телефоне включены",tag:"ma-push-test",url:"./"});
  return {ok:true};
}
async function handleSubscribeEmployee(body:any){
  const employee=String(body.employee||"").trim();
  const sub=body.subscription;
  if(!employee) throw new Error("Не выбран сотрудник");
  if(!sub?.endpoint) throw new Error("Нет push-подписки");
  const s=await loadScheduleSettings();
  const allowed=await configuredEmployeeNames(s);
  if(!allowed.has(employee)) throw new Error("Сотрудник не найден в графике");
  const {data:row,error}=await admin.from("ma_push_subscriptions").upsert({endpoint:sub.endpoint,subscription:sub,user_email:`employee:${employee}`,audience:"employee",employee,active:true,updated_at:new Date().toISOString()},{onConflict:"endpoint"}).select("id,subscription").single();
  if(error) throw error;
  await sendWebPush(row,{title:`${employee} — напоминания включены`,body:"Напомним о рабочем дне вечером, за 1 час и за 15 минут до смены.",tag:`employee-${employee}-test`,url:"./",employeeReminder:true});
  return {ok:true,employee};
}
async function handleUnsubscribeEmployee(body:any){
  const endpoint=String(body.endpoint||"").trim();
  const employee=String(body.employee||"").trim();
  if(!endpoint) throw new Error("Нет push-подписки");
  let q=admin.from("ma_push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("endpoint",endpoint).eq("audience","employee");
  if(employee) q=q.eq("employee",employee);
  const {error}=await q;
  if(error) throw error;
  return {ok:true};
}
async function handleSetPin(req:Request,body:any){
  await assertAdmin(req);
  const employee=String(body.employee||"").trim(), pin=String(body.pin||"");
  if(!employee) throw new Error("Не указано имя");
  if(!/^\d{4}$/.test(pin)) throw new Error("PIN должен состоять из 4 цифр");
  const pin_hash=await hashPin(pin);
  const {error}=await admin.from("ma_employee_pins").upsert({employee,role:"manager",pin_hash,active:true,updated_at:new Date().toISOString()},{onConflict:"employee"});
  if(error) throw error;
  return {ok:true};
}

async function verifyShiftDevice(service:string,deviceToken:string,deviceProof:any,action:string,employee:string){
  if(!deviceToken) throw new Error("Открыть смену можно только с зарегистрированного устройства сервиса");
  if(!deviceProof || !validProofTimestamp(deviceProof.timestamp)) throw new Error("Не удалось подтвердить подлинность рабочего устройства");
  const token_hash=await hashDeviceToken(deviceToken);
  const {data:device,error}=await admin.from("ma_shift_devices").select("id,service,label,active,public_key_jwk,key_version").eq("token_hash",token_hash).eq("active",true).maybeSingle();
  if(error) throw error;
  if(!device) throw new Error("Это устройство не зарегистрировано для открытия смен");
  if(device.service!==service) throw new Error(`Это устройство зарегистрировано для сервиса «${device.service}»`);
  if(!device.public_key_jwk) throw new Error("Устройство нужно заново зарегистрировать администратором");
  const message=["shift",action,service,employee,String(deviceProof.timestamp),deviceToken].join("|");
  const verified=await verifyDeviceSignature(device.public_key_jwk,message,String(deviceProof.signature||""));
  if(!verified) throw new Error("Подпись устройства не прошла проверку");
  await admin.from("ma_shift_devices").update({last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",device.id);
  return device;
}
async function handlePairDevice(req:Request,body:any){
  const user=await assertAdmin(req);
  const service=String(body.service||"").trim();
  const label=String(body.label||`Устройство ${service}`).trim().slice(0,80);
  const publicKeyJwk=body.publicKeyJwk;
  if(!service) throw new Error("Не выбран сервис");
  if(!publicKeyJwk || publicKeyJwk.kty!=="EC" || publicKeyJwk.crv!=="P-256" || !publicKeyJwk.x || !publicKeyJwk.y) throw new Error("Браузер не передал защищённый ключ устройства");
  const {error:offError}=await admin.from("ma_shift_devices").update({active:false,updated_at:new Date().toISOString()}).eq("service",service).eq("active",true);
  if(offError) throw offError;
  const token=randomDeviceToken();
  const token_hash=await hashDeviceToken(token);
  const {data:device,error}=await admin.from("ma_shift_devices").insert({service,label:label||`Устройство ${service}`,token_hash,public_key_jwk:publicKeyJwk,key_version:2,active:true,created_by:user.email,last_seen_at:new Date().toISOString()}).select("id,service,label,active,created_at,last_seen_at,key_version").single();
  if(error) throw error;
  return {ok:true,deviceToken:token,device};
}
async function handleDeviceStatus(body:any){
  const token=String(body.deviceToken||"");
  const proof=body.deviceProof;
  if(!token || !proof || !validProofTimestamp(proof.timestamp)) return {ok:true,allowed:false};
  const token_hash=await hashDeviceToken(token);
  const {data:device,error}=await admin.from("ma_shift_devices").select("id,service,label,active,created_at,last_seen_at,public_key_jwk,key_version").eq("token_hash",token_hash).eq("active",true).maybeSingle();
  if(error) throw error;
  if(!device || !device.public_key_jwk) return {ok:true,allowed:false};
  const message=["status",String(proof.timestamp),token].join("|");
  const verified=await verifyDeviceSignature(device.public_key_jwk,message,String(proof.signature||""));
  if(!verified) return {ok:true,allowed:false};
  await admin.from("ma_shift_devices").update({last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",device.id);
  return {ok:true,allowed:true,device:{id:device.id,service:device.service,label:device.label,active:device.active,created_at:device.created_at,last_seen_at:device.last_seen_at,key_version:device.key_version}};
}
async function handleListDevices(req:Request){
  await assertAdmin(req);
  const {data,error}=await admin.from("ma_shift_devices").select("id,service,label,active,created_at,last_seen_at,key_version").order("service",{ascending:true}).order("created_at",{ascending:false});
  if(error) throw error;
  return {ok:true,devices:data||[]};
}
async function handleRevokeDevice(req:Request,body:any){
  await assertAdmin(req);
  const id=String(body.id||"").trim();
  if(!id) throw new Error("Не указано устройство");
  const {error}=await admin.from("ma_shift_devices").update({active:false,updated_at:new Date().toISOString()}).eq("id",id);
  if(error) throw error;
  return {ok:true};
}

async function handleShift(req:Request,body:any){
  const action=body.action, service=String(body.service||"").trim(), employee=String(body.employee||"").trim(), pin=String(body.pin||"");
  if(!["open","close"].includes(action)) throw new Error("Неверное действие");
  if(!service||!employee) throw new Error("Не указан сервис или сотрудник");
  const adminUser=await getAdminIfValid(req);
  let shiftDevice:any=null;
  if(!adminUser){
    shiftDevice=await verifyShiftDevice(service,String(body.deviceToken||""),body.deviceProof,String(action),employee);
    await verifyPin(employee,pin);
  }
  const source=adminUser ? `admin:${adminUser.email}` : `device:${shiftDevice?.label||service}`;
  const now=new Date(), lp=localParts(now);
  const {data:existing,error:readError}=await admin.from("ma_shifts").select("*").eq("service",service).eq("shift_date",lp.date).is("voided_at",null).maybeSingle();
  if(readError) throw readError;
  const s=await loadScheduleSettings();
  const {start,end}=serviceShiftTimes(s,service);
  const expectedPair=(scheduleForDate(s,lp.date) as any)[service]||null;
  const expectedManager=expectedPair?.manager||null;
  const expectedMaster=expectedPair?.master||null;

  if(action==="open"){
    if(existing?.opened_at) return {ok:false,error:`Смена уже открыта: ${existing.opened_by||"—"} в ${localParts(new Date(existing.opened_at)).time}`};
    const late=Math.max(0,lp.hour*60+lp.minute-mins(start));
    const payload={service,shift_date:lp.date,expected_manager:expectedManager,expected_master:expectedMaster,opened_at:now.toISOString(),opened_by:employee,open_late_minutes:late,opened_source:source,opened_device_id:shiftDevice?.id||null,updated_at:now.toISOString()};
    const {error}=await admin.from("ma_shifts").insert(payload);
    if(error) throw error;
    const mismatch=expectedManager&&expectedManager!==employee?` ⚠ По графику: ${expectedManager}.`:"";
    const lateText=late>0?` Опоздание ${late} мин.`:"";
    const actorText=adminUser?`Администратор открыл за ${employee}`:`${employee} открыл`;
    await sendPush(`${service} — смена открыта`,`${actorText} смену в ${lp.time}.${lateText}${mismatch}`,`${service}-${lp.date}-open`);
    return {ok:true,localTime:lp.time,lateMinutes:late,expected:{manager:expectedManager,master:expectedMaster}};
  }

  if(!existing?.opened_at) throw new Error("Смена ещё не была открыта");
  if(existing.closed_at) return {ok:false,error:`Смена уже закрыта в ${localParts(new Date(existing.closed_at)).time}`};
  const early=Math.max(0,mins(end)-(lp.hour*60+lp.minute));
  const {error}=await admin.from("ma_shifts").update({closed_at:now.toISOString(),closed_by:employee,early_close_minutes:early,closed_source:source,closed_device_id:shiftDevice?.id||null,updated_at:now.toISOString()}).eq("id",existing.id);
  if(error) throw error;
  const earlyText=early>0?` Раньше графика на ${early} мин.`:"";
  const closeActorText=adminUser?`Администратор закрыл за ${employee}`:`${employee} закрыл`;
  await sendPush(`${service} — смена закрыта`,`${closeActorText} смену в ${lp.time}.${earlyText}`,`${service}-${lp.date}-close`);
  return {ok:true,localTime:lp.time,earlyMinutes:early};
}
async function handleAnnulShift(req:Request,body:any){
  const user=await assertAdmin(req);
  const service=String(body.service||"").trim();
  const date=String(body.date||localParts().date).trim();
  const reason=String(body.reason||"Аннулировано администратором").trim().slice(0,250);
  if(!service) throw new Error("Не указан сервис");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Неверная дата");
  const {data:row,error:readError}=await admin.from("ma_shifts").select("id").eq("service",service).eq("shift_date",date).is("voided_at",null).maybeSingle();
  if(readError) throw readError;
  if(!row) return {ok:true,voided:false};
  const now=new Date().toISOString();
  const {error:updateError}=await admin.from("ma_shifts").update({voided_at:now,voided_by:user.email,void_reason:reason,updated_at:now}).eq("id",row.id);
  if(updateError) throw updateError;
  const {error:deleteAlertsError}=await admin.from("ma_shift_alerts").delete().eq("service",service).eq("shift_date",date);
  if(deleteAlertsError) console.error("delete alerts",deleteAlertsError);
  console.log("shift annulled",{service,date,admin:user.email});
  return {ok:true,voided:true,service,date};
}

function isoToUtcMs(dateStr:string){
  const [y,m,d]=dateStr.split("-").map(Number);
  return Date.UTC(y,m-1,d);
}
function addDaysISO(dateStr:string,days:number){
  const dt=new Date(isoToUtcMs(dateStr)+days*86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
}
async function employeeReminderOnce(employee:string,workDate:string,type:string,title:string,text:string){
  const {data:subs,error:subError}=await admin.from("ma_push_subscriptions").select("id").eq("active",true).eq("audience","employee").eq("employee",employee).limit(1);
  if(subError){ console.error(subError); return; }
  if(!subs?.length) return;
  const {data:old,error:oldError}=await admin.from("ma_employee_reminder_alerts").select("id").eq("employee",employee).eq("work_date",workDate).eq("reminder_type",type).maybeSingle();
  if(oldError){ console.error(oldError); return; }
  if(old) return;
  const {error}=await admin.from("ma_employee_reminder_alerts").insert({employee,work_date:workDate,reminder_type:type,details:{text}});
  if(error){ if((error as any).code!=="23505") console.error(error); return; }
  await sendPushToEmployee(employee,title,text,`employee-${employee}-${workDate}-${type}`);
}
async function handleEmployeeReminders(s:any,lp:any,nowM:number){
  const names=[...await configuredEmployeeNames(s)], today=lp.date, tomorrow=addDaysISO(today,1);
  if(nowM>=20*60 && nowM<20*60+10){
    for(const employee of names){
      const work=employeeWorkForDate(s,String(employee),tomorrow);
      if(!work) continue;
      const t=serviceShiftTimes(s,work.service);
      await employeeReminderOnce(String(employee),tomorrow,"tomorrow",`${employee} — завтра на работу`,`Завтра ${work.service}, ${t.start}–${t.end}. Напарник: ${work.partner}.`);
    }
  }
  for(const employee of names){
    const work=employeeWorkForDate(s,String(employee),today);
    if(!work) continue;
    const t=serviceShiftTimes(s,work.service);
    const oneHourTarget=mins(t.start)-60, fifteenTarget=mins(t.start)-15;
    if(nowM>=oneHourTarget && nowM<oneHourTarget+10) await employeeReminderOnce(String(employee),today,"one_hour",`${employee} — через час на работу`,`Сегодня ${work.service}. Начало в ${t.start}. Напарник: ${work.partner}.`);
    if(nowM>=fifteenTarget && nowM<fifteenTarget+10) await employeeReminderOnce(String(employee),today,"fifteen",`${employee} — через 15 минут смена`,`${work.service}. Начало в ${t.start}. Пора быть на рабочем месте.`);
  }
}
async function alertOnce(service:string,date:string,type:string,title:string,text:string){
  const {data:old}=await admin.from("ma_shift_alerts").select("id").eq("service",service).eq("shift_date",date).eq("alert_type",type).maybeSingle();
  if(old) return;
  const {error}=await admin.from("ma_shift_alerts").insert({service,shift_date:date,alert_type:type,details:{text}});
  if(error){ if((error as any).code!=="23505") console.error(error); return; }
  await sendPush(title,text,`${service}-${date}-${type}`);
}
async function handleCron(req:Request){
  if(!CRON_SECRET||req.headers.get("x-cron-secret")!==CRON_SECRET) throw new Error("Неверный cron secret");
  const lp=localParts(), nowM=lp.hour*60+lp.minute;
  const s=await loadScheduleSettings();
  const services=[s.service1||"Моба",s.service2||"Нова"];
  await handleEmployeeReminders(s,lp,nowM);
  const {data:rows}=await admin.from("ma_shifts").select("*").eq("shift_date",lp.date).is("voided_at",null);
  for(const service of services){
    const row=(rows||[]).find((r:any)=>r.service===service);
    const t=serviceShiftTimes(s,String(service));
    if(nowM>=mins(t.start)+10 && !row?.opened_at) await alertOnce(String(service),lp.date,"not_opened",`${service} — смена не открыта`,`Прошло 10 минут после начала смены (${t.start}), но открытия нет.`);
    if(nowM>=mins(t.end)+15 && !row?.closed_at) await alertOnce(String(service),lp.date,"not_closed",`${service} — смена не закрыта`,`Прошло 15 минут после конца смены (${t.end}), но закрытия нет.`);
  }
  return {ok:true,time:lp.time,scheduleSource:"shared-schedule.js"};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try{
    const body=await req.json().catch(()=>({}));
    if(body.op==="subscribe") return json(await handleSubscribe(req,body));
    if(body.op==="subscribe-employee") return json(await handleSubscribeEmployee(body));
    if(body.op==="unsubscribe-employee") return json(await handleUnsubscribeEmployee(body));
    if(body.op==="set-pin") return json(await handleSetPin(req,body));
    if(body.op==="pair-device") return json(await handlePairDevice(req,body));
    if(body.op==="device-status") return json(await handleDeviceStatus(body));
    if(body.op==="list-devices") return json(await handleListDevices(req));
    if(body.op==="revoke-device") return json(await handleRevokeDevice(req,body));
    if(body.op==="shift") return json(await handleShift(req,body));
    if(body.op==="annul-shift") return json(await handleAnnulShift(req,body));
    if(body.op==="reset-shift") return json(await handleAnnulShift(req,body));
    if(body.op==="cron-check") return json(await handleCron(req));
    return json({ok:false,error:"Неизвестная операция"},400);
  }catch(e:any){
    console.error(e);
    const msg=e?.message||"Ошибка";
    const status=/прав|вход администратора/i.test(msg)?403:/PIN.*заблок/i.test(msg)?429:400;
    return json({ok:false,error:msg},status);
  }
});
