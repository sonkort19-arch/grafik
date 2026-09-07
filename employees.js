(function(global){
  "use strict";
  global.MAEmployees={
    create(deps){
      if(!deps || typeof deps.getSettings!=="function") throw new Error("MA Employees: getSettings dependency is required");
      const {
        moscowParts,dateObjectFromKey,employeesForDate,MANAGER_ROSTER_FROM,
        EMPLOYEE_STORAGE_KEY,EMPLOYEE_PUSH_NAME_KEY,expectedForDate,getCurrentMonthIndex,
        monthInfo,buildMonthRows,isNoManagerValue,isNoMasterValue,shiftStartForService,
        shiftMinutes,formatMoscowTime,escapeHtml
      }=deps;
      const settings=new Proxy({}, {
        get(_target,prop){ return (deps.getSettings()||{})[prop]; },
        set(_target,prop,value){ const s=deps.getSettings(); if(!s) return false; s[prop]=value; return true; },
        ownKeys(){ return Reflect.ownKeys(deps.getSettings()||{}); },
        getOwnPropertyDescriptor(){ return {enumerable:true,configurable:true}; }
      });

  function activeEmployeesForDate(dateStr=moscowParts().date){
    const date=dateObjectFromKey(dateStr);
    return employeesForDate(date).filter(emp=>
      !emp.inactive &&
      (!emp.employmentStart || emp.isExtra!==true || emp.employmentStart<=dateStr)
    );
  }
  function activeEmployeeNames(dateStr=moscowParts().date){
    return [...new Set(activeEmployeesForDate(dateStr).map(x=>x.name).filter(Boolean))];
  }
  function activeManagerNames(dateStr=moscowParts().date){
    const active=activeEmployeesForDate(dateStr);
    const names=active.filter(x=>x.role==="manager").map(x=>x.name).filter(Boolean);
    if(dateStr>=MANAGER_ROSTER_FROM){
      active.filter(x=>x.role==="master" && ["Георгий","Асик"].includes(x.name)).forEach(x=>{ if(x.name) names.push(x.name); });
    }
    return [...new Set(names)];
  }
  function allHistoricalManagerNames(){
    const names=new Set((settings.employeeSchedules||[]).filter(x=>x.role==="manager" || x.role==="master").map(x=>x.name));
    const changes=(settings.staffChanges||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
    let changed=true;
    while(changed){
      changed=false;
      changes.forEach(ch=>{
        if(names.has(ch.oldName) && ch.type!=="left" && ch.newName && !names.has(ch.newName)){
          names.add(ch.newName);
          changed=true;
        }
      });
    }
    return [...names].filter(Boolean);
  }
  function loadEmployeeName(){
    try{ return localStorage.getItem(EMPLOYEE_STORAGE_KEY)||""; }catch(e){ return ""; }
  }
  function saveEmployeeName(name){
    try{
      if(name) localStorage.setItem(EMPLOYEE_STORAGE_KEY,name);
      else localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    }catch(e){}
  }
  function employeePushName(){
    try{ return localStorage.getItem(EMPLOYEE_PUSH_NAME_KEY)||""; }catch(e){ return ""; }
  }
  function saveEmployeePushName(name){
    try{
      if(name) localStorage.setItem(EMPLOYEE_PUSH_NAME_KEY,name);
      else localStorage.removeItem(EMPLOYEE_PUSH_NAME_KEY);
    }catch(e){}
  }
  function selectedEmployee(){
    const name=loadEmployeeName();
    return activeEmployeeNames().includes(name) ? name : "";
  }
  function dateKeyLocal(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function employeeAssignmentForDate(name,dateStr){
    for(const service of [settings.service1,settings.service2]){
      const p=expectedForDate(dateStr,service);
      if(p && (p.manager===name || p.master===name)) return {service,pair:p};
    }
    return null;
  }
  function employeeUpcomingShifts(name,{afterToday=false,limit=14}={}){
    if(!name) return [];
    const today=moscowParts().date;
    const list=[];
    const startIdx=getCurrentMonthIndex();

    for(let offset=-1;offset<25 && list.length<limit*2;offset++){
      const i=startIdx+offset;
      const mi=monthInfo(i);
      if(mi.year<2020 || mi.year>2100) continue;
      const rows=buildMonthRows(i);

      for(const r of rows){
        const key=dateKeyLocal(r.date);
        if(afterToday ? key<=today : key<today) continue;
        if(r.s1.manager===name || r.s1.master===name){
          list.push({date:r.date,key,service:settings.service1,pair:r.s1});
        }
        if(r.s2.manager===name || r.s2.master===name){
          list.push({date:r.date,key,service:settings.service2,pair:r.s2});
        }
      }
    }
    list.sort((a,b)=>a.key.localeCompare(b.key));
    return list.slice(0,limit);
  }
  function employeeServiceState(service){
    const now=moscowParts();
    const row=(deps.getCurrentShiftRows()||[]).find(x=>x.service===service)||null;
    const exp=expectedForDate(now.date,service);
    if(exp && isNoManagerValue(exp.manager)){
      return {cls:"solo",label:"Работает только мастер",meta:"Менеджер по воскресеньям не требуется",exp};
    }
    const serviceStart=shiftStartForService(service);
    const currentMins=now.hour*60+now.minute, startMins=shiftMinutes(serviceStart);
    let cls="wait",label="Ожидаем открытия",meta="";
    if(row && row.opened_at && !row.closed_at){
      cls=(row.open_late_minutes||0)>0?"late":"open";
      label=`Открыта ${formatMoscowTime(row.opened_at)}`;
      meta=`Открыл: ${escapeHtml(row.opened_by||"—")}`;
    }else if(row && row.closed_at){
      cls="closed";
      label=`Закрыта ${formatMoscowTime(row.closed_at)}`;
      meta=`Закрыл: ${escapeHtml(row.closed_by||"—")} ${formatMoscowTime(row.closed_at)}`;
    }else if(currentMins>=startMins){
      cls="missing"; label="Смена не открыта"; meta="Подтверждения пока нет";
    }else{
      meta=`Начало в ${serviceStart}`;
    }
    return {cls,label,meta,exp};
  }
  function employeeNamesInMonth(monthIndex){
    const rows=buildMonthRows(monthIndex);
    const names=[];

    function addValue(value){
      const raw=String(value||"").trim();
      if(!raw || raw==="Не назначен" || isNoManagerValue(raw) || isNoMasterValue(raw)) return;

      if(raw.startsWith("Конфликт:")){
        raw.replace(/^Конфликт:\s*/,"").split(",").forEach(n=>{
          const name=n.trim();
          if(name) names.push(name);
        });
        return;
      }

      names.push(raw);
    }

    rows.forEach(r=>{
      addValue(r.s1.manager);
      addValue(r.s1.master);
      addValue(r.s2.manager);
      addValue(r.s2.master);
    });

    return [...new Set(names)];
  }
  function monthHasUnassigned(monthIndex){
    return buildMonthRows(monthIndex).some(r=>
      r.s1.manager==="Не назначен" ||
      r.s1.master==="Не назначен" ||
      r.s2.manager==="Не назначен" ||
      r.s2.master==="Не назначен"
    );
  }

      return {
        activeEmployeesForDate,activeEmployeeNames,activeManagerNames,allHistoricalManagerNames,
        loadEmployeeName,saveEmployeeName,employeePushName,saveEmployeePushName,selectedEmployee,
        dateKeyLocal,employeeAssignmentForDate,employeeUpcomingShifts,employeeServiceState,
        employeeNamesInMonth,monthHasUnassigned
      };
    }
  };
})(window);
