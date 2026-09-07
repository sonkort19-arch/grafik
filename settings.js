(function(global){
  "use strict";

  function create(options={}){
    const STORAGE_KEY=String(options.storageKey||"ma_schedule_22_v2");
    const DEFAULTS=options.defaults||{};
    const REMOVED_MASTER_NAME=String(options.removedMasterName||"");
    const MASTER_ROSTER_FROM=String(options.masterRosterFrom||"0000-00-00");
    const clone=options.clone;
    const getSettings=options.getSettings;
    const legacyPairPhase=options.legacyPairPhase;
    const addDaysToDateString=options.addDaysToDateString;
    const serviceKeyForName=options.serviceKeyForName;
    const serviceNameForKey=options.serviceNameForKey;
    const shiftMinutes=options.shiftMinutes;

  function makeEmployeesFromLegacy(s){
    const from=/^\d{4}-\d{2}-\d{2}$/.test(String(s.individualScheduleFrom||""))
      ? String(s.individualScheduleFrom)
      : String(s.anchorDate||DEFAULTS.anchorDate);
    const [fy,fm,fd]=from.split("-").map(Number);
    const migrationDate=new Date(fy,fm-1,fd);

    const managers=Array.isArray(s.managers)&&s.managers.length===2?s.managers:DEFAULTS.managers;
    const masters=Array.isArray(s.masters)&&s.masters.length===2?s.masters:DEFAULTS.masters;
    const result=[];

    function addPair(role,group,pair,prefix){
      const phase=legacyPairPhase(s,migrationDate,role,group);
      const firstStart=addDaysToDateString(from,-phase);
      const secondStart=addDaysToDateString(firstStart,2);
      if(String(pair?.[0]||"").trim()) result.push({id:`${prefix}-a`,name:String(pair[0]),role,group,slot:0,workDays:2,offDays:2,cycleStart:firstStart,employmentStart:from,isExtra:false,scheduleChanges:[]});
      if(String(pair?.[1]||"").trim()) result.push({id:`${prefix}-b`,name:String(pair[1]),role,group,slot:1,workDays:2,offDays:2,cycleStart:secondStart,employmentStart:from,isExtra:false,scheduleChanges:[]});
    }

    addPair("manager",0,managers[0],"mgr-g0");
    addPair("manager",1,managers[1],"mgr-g1");
    addPair("master",0,masters[0],"mst-g0");
    addPair("master",1,masters[1],"mst-g1");

    return result;
  }

  function syncLegacyTeamsFromEmployees(s=getSettings()){
    if(!s || !Array.isArray(s.employeeSchedules)) return s;

    function groupNames(role,group,fallback){
      const items=s.employeeSchedules
        .filter(x=>x.role===role && Number(x.group)===group && x.isExtra!==true)
        .sort((a,b)=>(Number(a.slot)||0)-(Number(b.slot)||0));
      return [
        items[0]?.name || fallback[0],
        items[1]?.name || fallback[1]
      ];
    }

    s.managers=[
      groupNames("manager",0,DEFAULTS.managers[0]),
      groupNames("manager",1,DEFAULTS.managers[1])
    ];
    s.masters=[
      groupNames("master",0,DEFAULTS.masters[0]),
      groupNames("master",1,DEFAULTS.masters[1])
    ];
    return s;
  }

  function normalizeScheduleSettings(raw){
    const merged=Object.assign(clone(DEFAULTS),raw||{});
    if(!Array.isArray(merged.managers) || merged.managers.length!==2) merged.managers=clone(DEFAULTS.managers);
    if(!Array.isArray(merged.masters) || merged.masters.length!==2) merged.masters=clone(DEFAULTS.masters);
    if(!Array.isArray(merged.staffChanges)) merged.staffChanges=[];
    if(!Array.isArray(merged.dayOverrides)) merged.dayOverrides=[];

    if(!merged.anchorDate){
      const oldYear=Number(raw?.startYear)||2026;
      const oldMonth=(Number(raw?.startMonth)||0)+1;
      merged.anchorDate=`${oldYear}-${String(oldMonth).padStart(2,"0")}-01`;
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(merged.anchorDate))){
      merged.anchorDate=DEFAULTS.anchorDate;
    }

    merged.serviceBlockDays=15;
    merged.balancedRosterEnabled=merged.balancedRosterEnabled!==false;
    merged.balancedRosterFrom=/^\d{4}-\d{2}-\d{2}$/.test(String(merged.balancedRosterFrom||""))
      ? String(merged.balancedRosterFrom)
      : "2026-08-01";
    if(!raw?.individualScheduleFrom || !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.individualScheduleFrom||""))){
      merged.individualScheduleFrom=merged.anchorDate;
    }else{
      merged.individualScheduleFrom=String(raw.individualScheduleFrom);
    }

    if(!Array.isArray(merged.employeeSchedules) || !merged.employeeSchedules.length){
      merged.employeeSchedules=makeEmployeesFromLegacy(merged);
    }else{
      merged.employeeSchedules=merged.employeeSchedules
        .filter(x=>x && x.name && ["manager","master"].includes(x.role) && !(x.role==="master" && String(x.name)===REMOVED_MASTER_NAME))
        .map((x,i)=>({
          id:String(x.id||`employee-${i}-${Math.random().toString(36).slice(2)}`),
          name:String(x.name),
          role:x.role==="master"?"master":"manager",
          group:Number(x.group)===1?1:0,
          slot:Number(x.slot)===1?1:0,
          workDays:Math.max(1,Math.min(14,Number(x.workDays)||2)),
          offDays:Math.max(1,Math.min(14,Number(x.offDays)||2)),
          cycleStart:/^\d{4}-\d{2}-\d{2}$/.test(String(x.cycleStart||""))?String(x.cycleStart):merged.anchorDate,
          employmentStart:/^\d{4}-\d{2}-\d{2}$/.test(String(x.employmentStart||""))?String(x.employmentStart):merged.individualScheduleFrom,
          isExtra:x.isExtra===true,
          scheduleChanges:(Array.isArray(x.scheduleChanges)?x.scheduleChanges:[])
            .filter(c=>c && /^\d{4}-\d{2}-\d{2}$/.test(String(c.from||"")))
            .map(c=>({
              from:String(c.from),
              workDays:Math.max(1,Math.min(14,Number(c.workDays)||2)),
              offDays:Math.max(1,Math.min(14,Number(c.offDays)||2)),
              cycleStart:/^\d{4}-\d{2}-\d{2}$/.test(String(c.cycleStart||""))?String(c.cycleStart):String(c.from)
            }))
            .sort((a,b)=>a.from.localeCompare(b.from))
        }));

      merged.employeeSchedules.forEach(emp=>{
        if(emp.name==="Аслан") emp.name="Асик";
      });

      const roles={manager:merged.employeeSchedules.filter(x=>x.role==="manager"),master:merged.employeeSchedules.filter(x=>x.role==="master")};
      if(roles.manager.length<4 || roles.master.length<3){
        merged.employeeSchedules=makeEmployeesFromLegacy(merged);
      }
    }

    merged.employeeSchedules=(merged.employeeSchedules||[]).filter(emp=>
      !(emp.role==="master" && emp.name===REMOVED_MASTER_NAME)
    );
    (merged.employeeSchedules||[]).forEach(emp=>{
      if(emp.name==="Аслан") emp.name="Асик";
    });
    if(Array.isArray(merged.managers)){
      merged.managers=merged.managers.map(pair=>pair.map(n=>n==="Аслан"?"Асик":n));
    }
    if(Array.isArray(merged.masters)){
      merged.masters=merged.masters.map(pair=>pair.map(n=>{
        const name=n==="Аслан"?"Асик":n;
        return name===REMOVED_MASTER_NAME?"":name;
      }));
    }

    syncLegacyTeamsFromEmployees(merged);

    merged.staffChanges=merged.staffChanges
      .filter(x=>x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date||"")) && x.oldName)
      .map(x=>{
        const rawNew=String(x.newName||"").trim();
        const leftText=/^(сотрудник\s+)?уш[её]л$/i.test(rawNew) || /уволил(ся|ась)$/i.test(rawNew);
        const isLeft=x.type==="left" || leftText;
        return {
          id:x.id||(`chg-${Date.now()}-${Math.random().toString(36).slice(2)}`),
          date:String(x.date),
          oldName:String(x.oldName)==="Аслан"?"Асик":String(x.oldName),
          newName:isLeft?"":(rawNew==="Аслан"?"Асик":rawNew),
          type:isLeft?"left":"replace"
        };
      })
      .filter(x=>x.type==="left" || x.newName)
      .sort((a,b)=>a.date.localeCompare(b.date));

    merged.dayOverrides=merged.dayOverrides
      .filter(x=>x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date||"")) && (x.service || x.serviceKey) && x.manager && x.master)
      .filter(x=>String(x.date)<MASTER_ROSTER_FROM || (String(x.master)!==REMOVED_MASTER_NAME && String(x.replacedName||"")!==REMOVED_MASTER_NAME))
      .map(x=>{
        const serviceKey=["s1","s2"].includes(x.serviceKey)
          ? x.serviceKey
          : serviceKeyForName(String(x.service||""),merged);
        const service=serviceKey ? serviceNameForKey(serviceKey,merged) : String(x.service||"");
        return {
          id:x.id||(`chg-${Date.now()}-${Math.random().toString(36).slice(2)}`),
          date:String(x.date),serviceKey,service,
          manager:String(x.manager)==="Аслан"?"Асик":String(x.manager),
          master:String(x.master)==="Аслан"?"Асик":String(x.master),
          reason:x.reason?String(x.reason):"",
          replacedRole:x.replacedRole==="master"?"master":(x.replacedRole==="manager"?"manager":""),
          replacedName:x.replacedName?(String(x.replacedName)==="Аслан"?"Асик":String(x.replacedName)):""
        };
      })
      .sort((a,b)=>a.date.localeCompare(b.date));

    return merged;
  }

  function mergeRemoteSettings(remote){
    return normalizeScheduleSettings(remote);
  }

  function loadSettings(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return normalizeScheduleSettings(clone(DEFAULTS));
      return normalizeScheduleSettings(JSON.parse(raw));
    }catch(e){ return normalizeScheduleSettings(clone(DEFAULTS)); }
  }

  function saveSettings(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getSettings()));
  }

  function validateNames(s){
    const all=(s.employeeSchedules||[]).map(x=>x.name.toLowerCase());
    return new Set(all).size===all.length;
  }

  function coreSettingsValidationError(s){
    const service1=String(s?.service1||"").trim();
    const service2=String(s?.service2||"").trim();
    if(!service1 || !service2) return "Укажи названия обеих точек";
    if(service1.toLowerCase()===service2.toLowerCase()) return "Названия двух точек должны отличаться";
    if(!validateNames(s)) return "Имена сотрудников должны отличаться";

    const start=shiftMinutes(s?.shiftStart);
    const end=shiftMinutes(s?.shiftEnd);
    if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start){
      return "Конец смены должен быть позже начала";
    }
    return "";
  }


    return {
      makeEmployeesFromLegacy,syncLegacyTeamsFromEmployees,normalizeScheduleSettings,mergeRemoteSettings,
      loadSettings,saveSettings,validateNames,coreSettingsValidationError
    };
  }

  global.MASettings={create};
})(typeof window!=="undefined" ? window : globalThis);
