import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const TZ="Europe/Moscow";
const ADMIN_EMAIL=(Deno.env.get("ADMIN_EMAIL")||"bul782@mail.ru").toLowerCase();
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
function secret(){const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;try{const x=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return x.default||Object.values(x)[0]||"";}catch{return "";}}
const db=createClient(SUPABASE_URL,secret(),{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"no-store"};
function json(x:any,status=200){return new Response(JSON.stringify(x),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});}
function norm(v:any){return String(v||"").toLocaleLowerCase("ru").replace(/ё/g,"е").replace(/[«»"'`,:;!?()]/g," ").replace(/\s+/g," ").trim();}
function keyNow(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const o:any={};for(const x of p)if(x.type!=="literal")o[x.type]=x.value;return `${o.year}-${o.month}-${o.day}`;}
function addDays(k:string,n:number){const [y,m,d]=k.split("-").map(Number);const x=new Date(Date.UTC(y,m-1,d+n));return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;}
function dateFromText(t:string,today:string){if(t.includes("позавчера"))return addDays(today,-2);if(t.includes("вчера"))return addDays(today,-1);if(t.includes("послезавтра"))return addDays(today,2);if(t.includes("завтра"))return addDays(today,1);return today;}
function ruDate(k:string){const [y,m,d]=k.split("-").map(Number);return new Intl.DateTimeFormat("ru-RU",{timeZone:"UTC",day:"numeric",month:"long"}).format(new Date(Date.UTC(y,m-1,d)));}
function timeMsk(iso:string|null){if(!iso)return "—";return new Intl.DateTimeFormat("ru-RU",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso));}
function nowMinutes(){const p=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());let h=0,m=0;for(const x of p){if(x.type==="hour")h=Number(x.value);if(x.type==="minute")m=Number(x.value);}return h*60+m;}
function hmMinutes(v:string){const [h,m]=String(v||"00:00").split(":").map(Number);return h*60+m;}
function serviceFilter(t:string){if(/\bмоб(?:а|е|у|ы)?\b/.test(t)||/мобильн\w* ангел/.test(t))return "Моба";if(/\bнов(?:а|е|у|ы)?\b/.test(t))return "Нова";return "";}
async function user(req:Request){const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return null;const {data,error}=await db.auth.getUser(token);if(error||!data?.user||(data.user.email||"").toLowerCase()!==ADMIN_EMAIL)return null;return {user:data.user,token};}
async function plan(token:string,from:string,to:string){const u=new URL(`${SUPABASE_URL}/functions/v1/ma-grafik-api/schedule`);u.searchParams.set("from",from);u.searchParams.set("to",to);const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||"Не удалось прочитать график");return d.days||[];}
function plannedStart(service:string){return service==="Нова"?"09:00":"08:00";}
function employeeNames(days:any[]){const s=new Set<string>();for(const d of days)for(const p of Object.values(d.services||{}) as any[]){for(const n of [p?.manager,p?.master])if(n&&!/^Без |^Не назначен|^Конфликт/.test(n))s.add(String(n));}return [...s];}
function mentioned(t:string,names:string[]){return names.find(n=>{const a=norm(n);return new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/ий$/,"(ий|ия|ию|ием)").replace(/а$/,"(а|ы|е|у|ой)")}(\\s|$)`).test(t);})||"";}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="GET")return json({ok:false,error:"Только чтение"},405);
 const auth=await user(req);if(!auth)return json({ok:false,error:"Требуется вход владельца MA График"},401);
 try{
  const url=new URL(req.url),q=String(url.searchParams.get("q")||"").trim(),t=norm(q);if(!q)return json({ok:false,error:"Пустой запрос"},400);
  if(/(поменяй|измени|исправь|поставь|запиши).*(приход|опозд|время.*откр)/.test(t))return json({ok:true,answer:"Изменение фактического времени прихода через помощника не поддерживается."});
  const today=keyNow();let from=dateFromText(t,today),to=from;
  if(t.includes("недел")){from=addDays(today,-6);to=today;}else if(t.includes("месяц")){from=addDays(today,-30);to=today;}
  const days=await plan(auth.token,from,to);const names=employeeNames(days),person=mentioned(t,names),svc=serviceFilter(t);
  let query=db.from("ma_shifts").select("id,service,shift_date,expected_manager,expected_master,opened_at,opened_by,closed_at,open_late_minutes,voided_at").gte("shift_date",from).lte("shift_date",to).is("voided_at",null).order("shift_date",{ascending:true});
  if(svc)query=query.eq("service",svc);const {data,error}=await query;if(error)throw error;const shifts=data||[];
  const rows:any[]=[];
  for(const d of days){for(const [service,pair] of Object.entries(d.services||{}) as any[]){if(svc&&service!==svc)continue;const matches=shifts.filter((x:any)=>x.shift_date===d.date&&x.service===service);if(matches.length>1){rows.push({date:d.date,service,conflict:true,pair});continue;}const x=matches[0]||null;rows.push({date:d.date,service,pair,shift:x,start:plannedStart(service)});}}
  const relevant=person?rows.filter(r=>[r.pair?.manager,r.pair?.master,r.shift?.opened_by].some((n:any)=>norm(n)===norm(person))):rows;
  if(person&&!relevant.length)return json({ok:true,answer:`${person} в выбранный период по графику не работает.`});
  const wantsLate=/опозд|вовремя/.test(t),wantsMissing=/не приш|не откры/.test(t),wantsNow=/сейчас.*работ|на работе/.test(t),wantsCount=/сколько раз|чаще/.test(t);
  const lines:string[]=[];let lateCount=0;
  for(const r of relevant){if(r.conflict){lines.push(`${ruDate(r.date)} · ${r.service}: несколько записей смены — вывод об опоздании не делаю.`);continue;}const x=r.shift,start=r.start;
    if(x?.opened_at){const late=Math.max(0,Number(x.open_late_minutes)||0);if(late>0)lateCount++;if(wantsLate&&late<=0)continue;if(wantsMissing)continue;if(wantsNow&&x.closed_at)continue;const who=x.opened_by||"не указано";lines.push(`${ruDate(r.date)} · ${r.service}: ${who} открыл смену в ${timeMsk(x.opened_at)}${late>0?` · опоздание ${late} мин`:` · вовремя`}.`);}
    else {if(wantsLate||wantsMissing||wantsNow){if(r.date===today){const delta=nowMinutes()-hmMinutes(start);if(delta>0)lines.push(`${r.service}: смена должна была открыться в ${start}, но отметки об открытии нет · задержка ${delta} мин.`);else if(wantsMissing)lines.push(`${r.service}: начало в ${start}; время смены ещё не наступило.`);}else if(wantsMissing)lines.push(`${ruDate(r.date)} · ${r.service}: данных об открытии смены нет.`);}}
  }
  if(wantsCount&&person){return json({ok:true,answer:`${person}: за выбранный период зафиксировано ${lateCount} опоздан${lateCount===1?"ие":"ия"} при открытии смены.\n\nВажно: приложение фиксирует открытие смены, а не физический вход сотрудника.`});}
  if(!lines.length){if(wantsLate)return json({ok:true,answer:"По имеющимся отметкам опозданий за выбранный период нет."});return json({ok:true,answer:"По этому запросу нет достоверных данных об открытии смены."});}
  return json({ok:true,answer:`${lines.join("\n")}\n\nВажно: это время открытия смены в приложении, а не подтверждение физического прихода каждого сотрудника.`});
 }catch(e){console.error("attendance",e);return json({ok:false,error:e?.message||"Ошибка данных о приходах"},400);}
});
