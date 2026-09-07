(function(global){
  "use strict";
  global.MASchedule={
    create(deps){
      if(!deps || typeof deps.getSettings!=="function") throw new Error("MA Schedule: getSettings dependency is required");
      const {anchorParts,monthInfo,serviceKeyForName,dateObjectFromKey,MASTER_ROSTER_FROM,MANAGER_ROSTER_FROM,REMOVED_MANAGER_NAME}=deps;
      const settings=new Proxy({}, {
        get(_target,prop){ return (deps.getSettings()||{})[prop]; },
        set(_target,prop,value){ const s=deps.getSettings(); if(!s) return false; s[prop]=value; return true; },
        ownKeys(){ return Reflect.ownKeys(deps.getSettings()||{}); },
        getOwnPropertyDescriptor(){ return {enumerable:true,configurable:true}; }
      });

  function scheduleStartDate(){
    const a=anchorParts();
    return new Date(a.year,a.month,a.day);
  }

  function globalDayIndex(date){
    const start=scheduleStartDate();
    const a=Date.UTC(start.getFullYear(),start.getMonth(),start.getDate());
    const b=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
    return Math.floor((b-a)/86400000);
  }

  function mod(n,m){ return ((n%m)+m)%m; }

  function dateKeyFromDate(date){
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function dateDiffDays(dateStr,date){
    const [y,m,d]=String(dateStr).split("-").map(Number);
    const a=Date.UTC(y,m-1,d);
    const b=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
    return Math.floor((b-a)/86400000);
  }

  function employeeCycleForDate(employee,date){
    const key=dateKeyFromDate(date);
    const changes=(employee.scheduleChanges||[])
      .filter(c=>c.from<=key)
      .slice()
      .sort((a,b)=>a.from.localeCompare(b.from));
    const current=changes.length?changes[changes.length-1]:null;
    return {
      workDays:Math.max(1,Number(current?.workDays ?? employee.workDays)||2),
      offDays:Math.max(1,Number(current?.offDays ?? employee.offDays)||2),
      cycleStart:current?.cycleStart || employee.cycleStart || settings.anchorDate,
      effectiveFrom:current?.from || employee.employmentStart || settings.individualScheduleFrom || settings.anchorDate
    };
  }

  function employeeWorksOnDate(employee,date){
    const key=dateKeyFromDate(date);
    const employmentStart=employee.employmentStart||settings.individualScheduleFrom||settings.anchorDate;
    if(key<employmentStart && employee.isExtra===true) return false;

    const cycleInfo=employeeCycleForDate(employee,date);
    const work=cycleInfo.workDays;
    const off=cycleInfo.offDays;
    const cycle=work+off;
    const phase=mod(dateDiffDays(cycleInfo.cycleStart,date),cycle);
    return phase<work;
  }

  function employeesForDate(date){
    const list=(settings.employeeSchedules||[]).map(x=>({...x}));
    const key=dateKeyFromDate(date);
    const changes=(settings.staffChanges||[]).filter(x=>x.date<=key).sort((a,b)=>a.date.localeCompare(b.date));

    changes.forEach(ch=>{
      list.forEach(emp=>{
        if(emp.name!==ch.oldName) return;
        if(ch.type==="left"){
          emp.inactive=true;
        }else if(ch.newName){
          emp.name=ch.newName;
          emp.inactive=false;
        }
      });
    });

    // С 07.09.2026 Сергей не участвует в действующем и будущем графике.
    // История до этой даты остаётся без изменений.
    if(key>=MANAGER_ROSTER_FROM){
      list.forEach(emp=>{
        if(emp.role==="manager" && emp.name===REMOVED_MANAGER_NAME) emp.inactive=true;
      });
    }

    return list;
  }

  function employeeServiceForDate(employee,date){
    const days=globalDayIndex(date);
    const blockDays=Math.max(1,Number(settings.serviceBlockDays)||14);
    const block=Math.floor(days/blockDays);
    const flip=mod(block,2);
    const group=Number(employee.group)===1?1:0;
    const serviceIndex=group===0 ? flip : 1-flip;
    return serviceIndex===0 ? settings.service1 : settings.service2;
  }

  function legacyTeamsForDate(date){
    const visible=employeesForDate(date).filter(x=>x.isExtra!==true);

    function pair(role,group){
      const items=visible
        .filter(x=>x.role===role && Number(x.group)===group)
        .sort((a,b)=>(Number(a.slot)||0)-(Number(b.slot)||0));
      return [0,1].map(slot=>{
        const emp=items.find(x=>(Number(x.slot)||0)===slot) || items[slot];
        return emp && !emp.inactive ? emp.name : null;
      });
    }

    return {
      managers:[pair("manager",0),pair("manager",1)],
      masters:[pair("master",0),pair("master",1)]
    };
  }

  function legacyBaseScheduleForDate(date){
    const days=globalDayIndex(date);
    const key=dateKeyFromDate(date);
    const blockDays=Math.max(1,Number(settings.serviceBlockDays)||14);
    const block=Math.floor(days/blockDays);
    const flip=mod(block,2);
    const partnerCycle=mod(Math.floor(block/2),2);
    const masterFlip=partnerCycle?2:0;
    const teams=legacyTeamsForDate(date);
    const visible=employeesForDate(date);

    function activeName(pair,offset){
      const phase=mod(days+offset,4);
      return pair[phase<2?0:1] || "Не назначен";
    }

    const selected={
      manager:{
        0:activeName(teams.managers[0],0),
        1:activeName(teams.managers[1],2)
      },
      master:{
        0:activeName(teams.masters[0],masterFlip),
        1:activeName(teams.masters[1],2+masterFlip)
      }
    };

    function hasModernCycle(emp){
      return (emp.scheduleChanges||[]).some(c=>c.from<=key);
    }

    function namesFor(role,group,service){
      const names=[];

      visible
        .filter(emp=>
          emp.isExtra!==true &&
          !emp.inactive &&
          emp.role===role &&
          Number(emp.group)===group
        )
        .forEach(emp=>{
          const works=hasModernCycle(emp)
            ? employeeWorksOnDate(emp,date)
            : emp.name===selected[role][group];
          if(works) names.push(emp.name);
        });

      visible
        .filter(emp=>
          emp.isExtra===true &&
          !emp.inactive &&
          emp.role===role &&
          (!emp.employmentStart || emp.employmentStart<=key) &&
          employeeServiceForDate(emp,date)===service &&
          employeeWorksOnDate(emp,date)
        )
        .forEach(emp=>names.push(emp.name));

      return [...new Set(names.filter(Boolean))];
    }

    function pairFor(service,group){
      const managerNames=namesFor("manager",group,service);
      const masterNames=namesFor("master",group,service);
      return {
        manager:managerNames.length===1?managerNames[0]:(managerNames.length===0?"Не назначен":`Конфликт: ${managerNames.join(", ")}`),
        master:masterNames.length===1?masterNames[0]:(masterNames.length===0?"Не назначен":`Конфликт: ${masterNames.join(", ")}`),
        managerCount:managerNames.length,
        masterCount:masterNames.length,
        managerNames,
        masterNames
      };
    }

    const g1=flip===0?0:1;
    const g2=flip===0?1:0;
    return {
      date,
      s1:pairFor(settings.service1,g1),
      s2:pairFor(settings.service2,g2)
    };
  }

  function standardBaseScheduleForDate(date){
    const key=dateKeyFromDate(date);
    if(settings.individualScheduleFrom && key<settings.individualScheduleFrom){
      return legacyBaseScheduleForDate(date);
    }
    const employees=employeesForDate(date);

    function pairForService(service){
      function choose(role){
        return employees.filter(emp=>
          !emp.inactive &&
          emp.role===role &&
          employeeServiceForDate(emp,date)===service &&
          employeeWorksOnDate(emp,date)
        );
      }

      const managers=choose("manager");
      const masters=choose("master");

      const managerNames=managers.map(x=>x.name);
      const masterNames=masters.map(x=>x.name);
      return {
        manager:managers.length===1?managers[0].name:(managers.length===0?"Не назначен":`Конфликт: ${managerNames.join(", ")}`),
        master:masters.length===1?masters[0].name:(masters.length===0?"Не назначен":`Конфликт: ${masterNames.join(", ")}`),
        managerCount:managers.length,
        masterCount:masters.length,
        managerNames,
        masterNames
      };
    }

    return {
      date,
      s1:pairForService(settings.service1),
      s2:pairForService(settings.service2)
    };
  }

  function sameRoster(names,required){
    const a=[...new Set(names)].sort((x,y)=>x.localeCompare(y,"ru"));
    const b=[...required].sort((x,y)=>x.localeCompare(y,"ru"));
    return a.length===b.length && a.every((x,i)=>x===b[i]);
  }

  function legacyMasterPlanBeforeRemoval(date){
    const key=dateKeyFromDate(date);
    const from=settings.balancedRosterFrom||"2026-08-01";
    if(key<from || key>=MASTER_ROSTER_FROM) return null;

    // Исторический график до увольнения Ислама сохраняем только для прошлых дат.
    // В действующем составе и будущих сменах Ислам больше не участвует.
    const days=dateDiffDays(from,date);
    const phase=mod(days,4);
    const day=date.getDate();
    const novaMaster=(phase===0 || phase===1) ? "Георгий" : "Асик";
    const baseMobaMaster=(phase===0 || phase===1) ? "Олег" : "Ислам";
    const swapPairing=(day>=12 && day<=21);
    const mobaMaster=swapPairing
      ? (baseMobaMaster==="Олег" ? "Ислам" : "Олег")
      : baseMobaMaster;

    return {s1:mobaMaster,s2:novaMaster,historical:true};
  }

  function fixedMasterPlanForDate(date){
    const key=dateKeyFromDate(date);
    if(key<MASTER_ROSTER_FROM) return null;

    // Временный график на отпуск Олега: 24–31 августа 2026.
    // У Георгия и Асика по одному выходному; в эти два дня Нова работает без мастера.
    const temporary={
      "2026-08-24":{s1:"Асик",s2:"Без мастера"},
      "2026-08-25":{s1:"Георгий",s2:"Асик"},
      "2026-08-26":{s1:"Георгий",s2:"Асик"},
      "2026-08-27":{s1:"Георгий",s2:"Без мастера"},
      "2026-08-28":{s1:"Георгий",s2:"Асик"},
      "2026-08-29":{s1:"Георгий",s2:"Асик"},
      "2026-08-30":{s1:"Асик",s2:"Георгий"},
      "2026-08-31":{s1:"Асик",s2:"Георгий"}
    };
    if(temporary[key]) return {...temporary[key],temporary:true};

    // Постоянный двухнедельный цикл. Его фаза считается от 24.08.2026,
    // поэтому после временного периода 01.09.2026 Олег выходит в Мобу,
    // а Георгий/Асик продолжают нужную неделю цикла без сдвига.
    const days=dateDiffDays(MASTER_ROSTER_FROM,date);
    const week=mod(Math.floor(days/7),2); // 0 = неделя 1, 1 = неделя 2
    const weekday=date.getDay(); // 0 вс, 1 пн ... 6 сб
    const weekend=(weekday===0 || weekday===6);

    let mobaMaster="Олег";
    let novaMaster="";

    if(week===0){
      if(weekend){
        mobaMaster="Георгий";
        novaMaster="Асик";
      }else{
        novaMaster=(weekday===1 || weekday===2) ? "Асик" : "Георгий";
      }
    }else{
      if(weekend){
        mobaMaster="Асик";
        novaMaster="Георгий";
      }else{
        novaMaster=(weekday===1 || weekday===2) ? "Георгий" : "Асик";
      }
    }

    return {s1:mobaMaster,s2:novaMaster,week:week+1};
  }

  function balancedRosterState(date){
    if(settings.balancedRosterEnabled===false) return null;

    const key=dateKeyFromDate(date);
    const from=settings.balancedRosterFrom||"2026-08-01";
    if(key<from) return null;

    const active=employeesForDate(date).filter(emp=>
      !emp.inactive &&
      (!emp.employmentStart || emp.isExtra!==true || emp.employmentStart<=key)
    );

    const managers=[...new Set(active.filter(x=>x.role==="manager").map(x=>x.name))];
    const masters=[...new Set(active.filter(x=>x.role==="master").map(x=>x.name))];

    const managerReady=key<MANAGER_ROSTER_FROM
      ? sameRoster(managers,["Сергей","Арсен","Дина"])
      : sameRoster(managers,["Арсен","Дина"]);
    const masterReady=key>=MASTER_ROSTER_FROM && sameRoster(masters,["Олег","Георгий","Асик"]);

    if(!managerReady && !masterReady) return null;

    // Менеджеры закреплены по точкам постоянно.
    // Моба: только Арсен и Дина, оба работают 2/2 в противофазе.
    // Нова: только Сергей, график 5/2 (пн–пт), сб/вс выходной.
    const anchor=new Date(2026,7,1);
    const days=dateDiffDays(from,date);
    const half=date.getDate()>=16?1:0;
    const block=Math.floor(days/15);

    let managerS1=null,managerS2=null,managerOff=[];

    if(managerReady){
      const mobaPhase=mod(days,4);
      const mobaRegularManager=(mobaPhase===0 || mobaPhase===1) ? "Арсен" : "Дина";

      if(key>=MANAGER_ROSTER_FROM){
        managerS1=mobaRegularManager;
        managerS2=null;
        managerOff=["Арсен","Дина"].filter(name=>name!==managerS1);
      }else{
        const weekday=date.getDay();
        const swapDay=(weekday===2 || weekday===4);
        if(swapDay){
          managerS1="Сергей";
          managerS2=mobaRegularManager;
        }else{
          managerS1=mobaRegularManager;
          managerS2=(weekday>=1 && weekday<=5) ? "Сергей" : "Без менеджера";
        }
        managerOff=["Арсен","Дина","Сергей"].filter(name=>name!==managerS1 && name!==managerS2);
      }
    }

    // Новый цикл мастеров:
    // Олег — только Моба Пн–Пт; Георгий и Асик — Нова и выходные в Мобе по очереди.
    let masterS1=null,masterS2=null,masterOff=[];
    let masterTeamS1=[],masterTeamS2=[];

    if(masterReady){
      const masterDay=fixedMasterPlanForDate(date);
      masterS1=masterDay.s1;
      masterS2=masterDay.s2;
      masterOff=["Олег","Георгий","Асик"].filter(n=>n!==masterS1 && n!==masterS2);
      masterTeamS1=["Олег","Георгий","Асик"];
      masterTeamS2=["Георгий","Асик"];
    }

    if(managerReady && masterReady && key>=MANAGER_ROSTER_FROM){
      managerS2=masterS2;
    }

    return {
      from,
      block,
      half,
      managerReady,
      masterReady,
      manager:{
        s1:managerS1,
        s2:managerS2,
        off:managerOff,
        fixedS1:"Арсен / Дина",
        fixedS2:key>=MANAGER_ROSTER_FROM?"Мастер Новы":"Сергей",
        reserve:""
      },
      master:{
        s1:masterS1,
        s2:masterS2,
        off:masterOff,
        teamS1:masterTeamS1,
        teamS2:masterTeamS2
      }
    };
  }

  function isBalancedRosterRole(role,date){
    const state=balancedRosterState(date);
    return !!(state && (role==="manager"?state.managerReady:state.masterReady));
  }

  function isNovaWeekendRule(date,serviceName=settings.service2){
    const d=date instanceof Date ? date : dateObjectFromKey(String(date));
    return serviceName===settings.service2 && (d.getDay()===0 || d.getDay()===6);
  }

  function isNoManagerValue(value){
    return String(value||"").trim()==="Без менеджера";
  }

  function isNoMasterValue(value){
    return String(value||"").trim()==="Без мастера";
  }

  function baseScheduleForDate(date){
    const base=standardBaseScheduleForDate(date);
    const state=balancedRosterState(date);
    if(!state) return base;

    if(state.managerReady){
      base.s1.manager=state.manager.s1;
      base.s1.managerCount=1;
      base.s1.managerNames=[state.manager.s1];

      if(isNoManagerValue(state.manager.s2)){
        base.s2.manager="Без менеджера";
        base.s2.managerCount=0;
        base.s2.managerNames=[];
      }else{
        base.s2.manager=state.manager.s2;
        base.s2.managerCount=1;
        base.s2.managerNames=[state.manager.s2];
      }
    }

    const historicalMasterDay=legacyMasterPlanBeforeRemoval(date);
    if(historicalMasterDay){
      base.s1.master=historicalMasterDay.s1;
      base.s2.master=historicalMasterDay.s2;
      base.s1.masterCount=1;
      base.s2.masterCount=1;
      base.s1.masterNames=[historicalMasterDay.s1];
      base.s2.masterNames=[historicalMasterDay.s2];
    }else if(state.masterReady){
      base.s1.master=state.master.s1;
      base.s2.master=state.master.s2;
      base.s1.masterCount=isNoMasterValue(state.master.s1)?0:1;
      base.s2.masterCount=isNoMasterValue(state.master.s2)?0:1;
      base.s1.masterNames=isNoMasterValue(state.master.s1)?[]:[state.master.s1];
      base.s2.masterNames=isNoMasterValue(state.master.s2)?[]:[state.master.s2];
    }

    // По субботам и воскресеньям в Нове менеджера нет.
    // Мастер в Нове выбран новым двухнедельным циклом: Георгий или Асик.
    if(dateKeyFromDate(date)<MANAGER_ROSTER_FROM && isNovaWeekendRule(date,settings.service2)){
      base.s2.manager="Без менеджера";
      base.s2.managerCount=0;
      base.s2.managerNames=[];
    }

    return base;
  }

  function daySchedule(monthIndex,day){
    const info=monthInfo(monthIndex);
    const date=new Date(info.year,info.month,day);
    const base=baseScheduleForDate(date);

    const result={
      date,
      s1:{manager:base.s1.manager,master:base.s1.master},
      s2:{manager:base.s2.manager,master:base.s2.master}
    };

    const key=dateKeyFromDate(date);
    const overrides=(settings.dayOverrides||[]).filter(x=>x.date===key);

    overrides.forEach(o=>{
      const serviceKey=o.serviceKey || serviceKeyForName(o.service);
      if(serviceKey==="s1") result.s1={manager:o.manager,master:o.master};
      if(serviceKey==="s2") result.s2={manager:o.manager,master:o.master};
    });

    return result;
  }

      return {
        scheduleStartDate,
        globalDayIndex,
        mod,
        dateKeyFromDate,
        dateDiffDays,
        employeeCycleForDate,
        employeeWorksOnDate,
        employeesForDate,
        employeeServiceForDate,
        legacyTeamsForDate,
        legacyBaseScheduleForDate,
        standardBaseScheduleForDate,
        sameRoster,
        legacyMasterPlanBeforeRemoval,
        fixedMasterPlanForDate,
        balancedRosterState,
        isBalancedRosterRole,
        isNovaWeekendRule,
        isNoManagerValue,
        isNoMasterValue,
        baseScheduleForDate,
        daySchedule
      };
    }
  };
})(window);
