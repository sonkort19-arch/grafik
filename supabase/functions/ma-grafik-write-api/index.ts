import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const TZ="Europe/Moscow";
const ADMIN_EMAIL=(Deno.env.get("ADMIN_EMAIL")||"bul782@mail.ru").toLowerCase();
const MASTER_ROSTER_FROM="2026-08-24";
const MANAGER_ROSTER_FROM="2026-09-07";
const REMOVED_MASTER_NAME="Ислам";
const REMOVED_MANAGER_NAME="Сергей";
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Cache-Control":"no-store"
};

function secretKey(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  try{const x=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return x.default||Object.values(x)[0]||"";}catch{return "";}
}
const admin=createClient(Deno.env.get("SUPABASE_URL")||"",secretKey(),{auth:{persistSession:false,autoRefreshToken:false}});
const clone=(v:any)=>JSON.parse(JSON.stringify(v));
const name=(v:any)=>{const s=String(v||"").trim();return s==="Аслан"?"Асик":s;};
const same=(a:any,b:any)=>name(a).toLocaleLowerCase("ru")===name(b).toLocaleLowerCase("ru");
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
function validDate(v:any){
  const s=String(v||""); if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const [y,m,d]=s.split("-").map(Number),dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
}
async function owner(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user||String(data.user.email||"").toLowerCase()!==ADMIN_EMAIL)return null;
  return data.user;
}
async function config(){
  const {data,error}=await admin.from("ma_schedule_config").select("settings,updated_at").eq("id","main").maybeSingle();
  if(error)throw error; if(!data?.settings)throw new Error("Общий график не найден");
  return {raw:clone(data.settings),updatedAt:String(data.updated_at||"")};
}
function service(raw:any,v:any){
  const s1=String(raw.service1||"Моба"),s2=String(raw.service2||"Нова"),q=String(v||"").trim();
  if(q==="s1"||same(q,s1))return {key:"s1",name:s1};
  if(q==="s2"||same(q,s2))return {key:"s2",name:s2};
  throw new Error(`Неизвестная точка. Доступно: ${s1}, ${s2}`);
}
function active(raw:any,date:string){
  const list=(Array.isArray(raw.employeeSchedules)?raw.employeeSchedules:[])
    .filter((x:any)=>x?.name&&["manager","master"].includes(String(x.role)))
    .map((x:any)=>({name:name(x.name),role:x.role==="master"?"master":"manager",inactive:false}));
  const changes=(Array.isArray(raw.staffChanges)?raw.staffChanges:[])
    .filter((x:any)=>x?.oldName&&validDate(x.date)&&String(x.date)<=date)
    .slice().sort((a:any,b:any)=>String(a.date).localeCompare(String(b.date)));
  for(const ch of changes)for(const e of list){
    if(!same(e.name,ch.oldName))continue;
    const n=name(ch.newName),left=ch.type==="left"||!n||/^(сотрудник\s+)?уш[её]л$/i.test(n)||/уволил(ся|ась)$/i.test(n);
    if(left)e.inactive=true; else {e.name=n;e.inactive=false;}
  }
  for(const e of list){
    if(date>=MASTER_ROSTER_FROM&&e.role==="master"&&same(e.name,REMOVED_MASTER_NAME))e.inactive=true;
    if(date>=MANAGER_ROSTER_FROM&&e.role==="manager"&&same(e.name,REMOVED_MANAGER_NAME))e.inactive=true;
  }
  return list.filter((e:any,i:number,a:any[])=>!e.inactive&&a.findIndex(x=>x.role===e.role&&same(x.name,e.name))===i);
}
function pair(raw:any,date:string,svc:any,target:any){
  const people=active(raw,date),m0=name(target?.manager),w0=name(target?.master);
  if(!m0||!w0)throw new Error("Нужно передать target.manager и target.master");
  const canonical=(v:string)=>people.find((x:any)=>same(x.name,v))?.name||v;
  const manager=m0==="Без менеджера"?m0:canonical(m0),master=w0==="Без мастера"?w0:canonical(w0);
  if(manager!=="Без менеджера"){
    const e=people.find((x:any)=>same(x.name,manager)); if(!e)throw new Error(`Сотрудник «${manager}» не найден в действующем составе`);
    const responsible=svc.key==="s2"&&same(manager,master)&&e.role==="master";
    if(e.role!=="manager"&&!responsible)throw new Error(`«${manager}» не является действующим менеджером`);
  }
  if(master!=="Без мастера"){
    const e=people.find((x:any)=>same(x.name,master)); if(!e)throw new Error(`Сотрудник «${master}» не найден в действующем составе`);
    if(e.role!=="master")throw new Error(`«${master}» не является действующим мастером`);
  }
  return {manager,master};
}
function expected(v:any){
  const manager=name(v?.manager),master=name(v?.master);
  if(!manager||!master)throw new Error("Передай expectedCurrent из read-API");
  return {manager,master};
}
function matches(row:any,date:string,svc:any){
  return row&&String(row.date||"")===date&&(String(row.serviceKey||"")===svc.key||same(row.service,svc.name));
}
function nextSettings(raw:any,date:string,svc:any,before:any,after:any,reason:string){
  const next=clone(raw),rows=Array.isArray(next.dayOverrides)?next.dayOverrides:[];
  next.dayOverrides=rows.filter((r:any)=>!matches(r,date,svc));
  const managerChanged=!same(before.manager,after.manager),masterChanged=!same(before.master,after.master);
  next.dayOverrides.push({
    id:`chatgpt-${Date.now()}-${crypto.randomUUID().slice(0,8)}`,date,serviceKey:svc.key,service:svc.name,
    manager:after.manager,master:after.master,reason:reason.slice(0,250),
    replacedRole:managerChanged&&!masterChanged?"manager":masterChanged&&!managerChanged?"master":"",
    replacedName:managerChanged&&!masterChanged?before.manager:masterChanged&&!managerChanged?before.master:""
  });
  next.dayOverrides.sort((a:any,b:any)=>String(a.date||"").localeCompare(String(b.date||"")));
  return next;
}
function parse(raw:any,body:any,updatedAt:string){
  const date=String(body?.date||""); if(!validDate(date))throw new Error("date должна быть YYYY-MM-DD");
  const expectedUpdatedAt=String(body?.expectedConfigUpdatedAt||""); if(!expectedUpdatedAt)throw new Error("Нужен expectedConfigUpdatedAt из read-API");
  if(expectedUpdatedAt!==updatedAt){const e:any=new Error("График изменился после чтения. Сначала получи его заново");e.status=409;throw e;}
  const svc=service(raw,body?.service),before=expected(body?.expectedCurrent),after=pair(raw,date,svc,body?.target);
  const reason=String(body?.reason||"Изменение через ChatGPT").trim()||"Изменение через ChatGPT";
  return {date,svc,before,after,reason};
}
async function apply(user:any,current:any,c:any){
  const settings=nextSettings(current.raw,c.date,c.svc,c.before,c.after,c.reason),now=new Date().toISOString();
  const {data,error}=await admin.from("ma_schedule_config").update({settings,updated_at:now}).eq("id","main").eq("updated_at",current.updatedAt).select("updated_at").maybeSingle();
  if(error)throw error; if(!data?.updated_at){const e:any=new Error("График успел измениться. Изменение не применено");e.status=409;throw e;}
  const audit=await admin.from("ma_grafik_api_audit").insert({actor_email:user.email||ADMIN_EMAIL,action:"apply_change",status:"applied",work_date:c.date,service:c.svc.name,before_pair:c.before,after_pair:c.after,config_before_updated_at:current.updatedAt||null,config_after_updated_at:data.updated_at,previous_settings:current.raw});
  if(audit.error)console.error("MA Grafik audit",audit.error);
  return {updatedAt:data.updated_at,auditStored:!audit.error,dayOverride:{date:c.date,service:c.svc.name,...c.after,reason:c.reason}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  const url=new URL(req.url),marker="/ma-grafik-write-api",i=url.pathname.indexOf(marker);
  const route=(i>=0?url.pathname.slice(i+marker.length):url.pathname).replace(/\/+$/,"")||"/";
  if(req.method==="GET"&&(route==="/"||route==="/health"))return json({ok:true,service:"MA Grafik Write API",version:"1.0.0",mode:"protected-write",authRequired:true,writesRequirePreviewVersion:true,writesRequireConfirm:true});
  if(req.method==="GET"&&route==="/capabilities")return json({ok:true,commands:["preview_change","apply_change"],scope:"single-day dayOverrides only"});
  if(req.method!=="POST")return json({ok:false,error:"Для изменений нужен POST"},405);
  const user=await owner(req); if(!user)return json({ok:false,error:"Требуется вход владельца MA График"},401);
  try{
    const body=await req.json().catch(()=>({})),current=await config(),c=parse(current.raw,body,current.updatedAt);
    if(route==="/preview-change")return json({ok:true,timezone:TZ,mode:"preview",configUpdatedAt:current.updatedAt,date:c.date,service:c.svc.name,before:c.before,after:c.after,reason:c.reason,willChange:!same(c.before.manager,c.after.manager)||!same(c.before.master,c.after.master),requiresConfirm:true});
    if(route==="/apply-change"){
      if(body.confirm!==true)return json({ok:false,error:"Изменение не применено: confirm должен быть true"},400);
      if(same(c.before.manager,c.after.manager)&&same(c.before.master,c.after.master))return json({ok:false,error:"Изменений нет"},400);
      return json({ok:true,timezone:TZ,applied:true,...await apply(user,current,c)});
    }
    return json({ok:false,error:"Неизвестный маршрут"},404);
  }catch(e:any){console.error("MA Grafik Write API",e);return json({ok:false,error:e?.message||"Ошибка API"},Number(e?.status)||400);}
});
