(function(global){
  "use strict";

  const MONTHS={
    "январь":1,"января":1,"янв":1,
    "февраль":2,"февраля":2,"фев":2,
    "март":3,"марта":3,"мар":3,
    "апрель":4,"апреля":4,"апр":4,
    "май":5,"мая":5,
    "июнь":6,"июня":6,"июн":6,
    "июль":7,"июля":7,"июл":7,
    "август":8,"августа":8,"авг":8,
    "сентябрь":9,"сентября":9,"сен":9,"сент":9,
    "октябрь":10,"октября":10,"окт":10,
    "ноябрь":11,"ноября":11,"ноя":11,
    "декабрь":12,"декабря":12,"дек":12
  };

  function normalizeText(value){
    return String(value||"")
      .toLocaleLowerCase("ru")
      .replace(/ё/g,"е")
      .replace(/[«»"'`]/g,"")
      .replace(/[,:;!?()]/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function isDateKey(value){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));
  }

  function dateFromKey(key){
    if(!isDateKey(key)) return null;
    const [y,m,d]=String(key).split("-").map(Number);
    const dt=new Date(Date.UTC(y,m-1,d));
    if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d) return null;
    return dt;
  }

  function dateKey(date){
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
  }

  function addDays(key,days){
    const dt=dateFromKey(key);
    if(!dt) return "";
    dt.setUTCDate(dt.getUTCDate()+Number(days||0));
    return dateKey(dt);
  }

  function parseDate(text,todayKey){
    const today=isDateKey(todayKey)?todayKey:dateKey(new Date());
    const t=normalizeText(text);
    if(t.includes("послезавтра")) return {key:addDays(today,2),source:"relative"};
    if(t.includes("завтра")) return {key:addDays(today,1),source:"relative"};
    if(t.includes("сегодня")) return {key:today,source:"relative"};

    const numeric=t.match(/(?:^|\s)(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?(?:\s|$)/);
    if(numeric){
      let year=numeric[3]?Number(numeric[3]):Number(today.slice(0,4));
      if(year<100) year+=2000;
      const key=`${year}-${String(Number(numeric[2])).padStart(2,"0")}-${String(Number(numeric[1])).padStart(2,"0")}`;
      if(dateFromKey(key)) return {key,source:"numeric"};
    }

    const monthNames=Object.keys(MONTHS).sort((a,b)=>b.length-a.length).join("|");
    const named=t.match(new RegExp(`(?:^|\\s)(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{4}))?(?:\\s|$)`));
    if(named){
      const year=named[3]?Number(named[3]):Number(today.slice(0,4));
      const key=`${year}-${String(MONTHS[named[2]]).padStart(2,"0")}-${String(Number(named[1])).padStart(2,"0")}`;
      if(dateFromKey(key)) return {key,source:"named"};
    }
    return null;
  }

  function nextMonday(todayKey){
    const dt=dateFromKey(todayKey);
    if(!dt) return todayKey;
    const weekday=dt.getUTCDay();
    const delta=weekday===0?1:(8-weekday);
    return addDays(todayKey,delta);
  }

  function parseRange(text,todayKey){
    const t=normalizeText(text);
    const explicit=parseDate(text,todayKey);
    let from=explicit?.key||todayKey;
    if(!explicit && /следующ\w*\s+недел/.test(t)) from=nextMonday(todayKey);

    let days=1;
    if(/(?:^|\s)(две|2)\s+недел/.test(t)||/(?:^|\s)14\s+дн/.test(t)) days=14;
    else if(/(?:^|\s)(три|3)\s+недел/.test(t)||/(?:^|\s)21\s+дн/.test(t)) days=21;
    else if(t.includes("недел")||/(?:^|\s)7\s+дн/.test(t)) days=7;
    else if(t.includes("месяц")||/(?:^|\s)(30|31)\s+дн/.test(t)) days=31;

    return {from,to:addDays(from,days-1),days};
  }

  function parseService(text){
    const t=normalizeText(text);
    if(/(?:^|\s)моб(?:а|е|у|ы)?(?:\s|$)/.test(t)||t.includes("мобильный ангел")) return "Моба";
    if(/(?:^|\s)нов(?:а|е|у|ы)?(?:\s|$)/.test(t)) return "Нова";
    return "";
  }

  function employeeAliases(name){
    const normalized=normalizeText(name);
    const aliases=new Set([normalized]);
    const add=value=>{if(value)aliases.add(value);};

    if(normalized.endsWith("ий")){
      const stem=normalized.slice(0,-2);
      add(`${stem}ия`);add(`${stem}ию`);add(`${stem}ии`);
    }else if(normalized.endsWith("ия")){
      const stem=normalized.slice(0,-1);
      add(`${stem}и`);add(`${stem}ю`);
    }else if(normalized.endsWith("й")){
      const stem=normalized.slice(0,-1);
      add(`${stem}я`);add(`${stem}ю`);add(`${stem}е`);
    }else if(normalized.endsWith("а")){
      const stem=normalized.slice(0,-1);
      add(`${stem}ы`);add(`${stem}е`);add(`${stem}у`);
    }else if(normalized.endsWith("я")){
      const stem=normalized.slice(0,-1);
      add(`${stem}и`);add(`${stem}е`);add(`${stem}ю`);
    }else if(/[бвгджзклмнпрстфхцчшщк]$/.test(normalized)){
      add(`${normalized}а`);add(`${normalized}у`);add(`${normalized}е`);
    }

    if(normalized==="асик"){
      ["аслан","аслана","аслану","аслане"].forEach(add);
    }
    return [...aliases];
  }

  function findMentionedEmployees(text,names){
    const t=` ${normalizeText(text)} `;
    const found=[];
    for(const name of names||[]){
      let best=-1;
      for(const alias of employeeAliases(name)){
        const index=t.indexOf(` ${alias} `);
        if(index>=0 && (best<0||index<best)) best=index;
      }
      if(best>=0) found.push({name,index:best});
    }
    return found.sort((a,b)=>a.index-b.index);
  }

  function parseReplacement(text,names){
    const t=` ${normalizeText(text)} `;
    const mentions=findMentionedEmployees(text,names);
    if(mentions.length<2) return null;

    const instead=t.indexOf(" вместо ");
    if(instead>=0){
      const oldCandidates=mentions.filter(x=>x.index>instead);
      const newCandidates=mentions.filter(x=>x.index<instead);
      if(oldCandidates.length&&newCandidates.length){
        return {oldName:oldCandidates[0].name,newName:newCandidates[newCandidates.length-1].name,kind:"instead"};
      }
    }

    const replace=t.indexOf(" замени ");
    const on=t.indexOf(" на ",Math.max(0,replace));
    if(replace>=0&&on>replace){
      const oldCandidates=mentions.filter(x=>x.index>replace&&x.index<on);
      const newCandidates=mentions.filter(x=>x.index>on);
      if(oldCandidates.length&&newCandidates.length){
        return {oldName:oldCandidates[0].name,newName:newCandidates[0].name,kind:"replace"};
      }
    }

    return {oldName:mentions[1].name,newName:mentions[0].name,kind:"ordered"};
  }

  function isConfirmation(text){
    const t=normalizeText(text);
    return /^(да|сделай|меняй|подтверждаю|подтвердить|применить|ок|окей)$/.test(t);
  }

  function isCancellation(text){
    const t=normalizeText(text);
    return /^(нет|отмена|отмени|не надо|не меняй|стоп)$/.test(t);
  }

  global.MAAssistantCore={
    normalizeText,isDateKey,dateFromKey,dateKey,addDays,parseDate,nextMonday,parseRange,
    parseService,findMentionedEmployees,parseReplacement,isConfirmation,isCancellation
  };
})(typeof window!=="undefined"?window:globalThis);
