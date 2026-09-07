(function(global){
  "use strict";

  function create(options={}){
    const expectedForDate=options.expectedForDate;
    const serviceNames=options.serviceNames||(()=>[]);
    const getEmployeesForDate=options.getEmployeesForDate||(()=>[]);
    const isNoManagerValue=options.isNoManagerValue||(()=>false);
    const shiftStartForService=options.shiftStartForService||(()=>"00:00");
    const shiftEndForService=options.shiftEndForService||(()=>"23:59");
    const shiftMinutes=options.shiftMinutes||((value)=>{
      const [h,m]=String(value||"00:00").split(":").map(Number);
      return (Number(h)||0)*60+(Number(m)||0);
    });
    const moscowParts=options.moscowParts||(()=>({date:new Date().toISOString().slice(0,10),hour:0,minute:0}));
    const escapeHtml=options.escapeHtml||((value)=>String(value??""));

    function addDaysISO(dateStr,days){
      const [y,m,d]=String(dateStr).split("-").map(Number);
      const dt=new Date(Date.UTC(y,m-1,d));
      dt.setUTCDate(dt.getUTCDate()+Number(days||0));
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
    }

    function monthRange(monthKey){
      const match=/^(\d{4})-(\d{2})$/.exec(String(monthKey||""));
      if(!match) return null;
      const y=Number(match[1]),m=Number(match[2]);
      if(m<1||m>12) return null;
      const last=new Date(Date.UTC(y,m,0)).getUTCDate();
      return {from:`${y}-${String(m).padStart(2,"0")}-01`,to:`${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`};
    }

    function roleLabel(role){
      if(role==="manager") return "Менеджер";
      if(role==="master") return "Мастер";
      return "Сотрудник";
    }

    function statusForScore(score){
      if(score===null || score===undefined) return {key:"nodata",text:"Нет данных"};
      if(score>=90) return {key:"excellent",text:"Отлично"};
      if(score>=80) return {key:"normal",text:"Нормально"};
      if(score>=70) return {key:"attention",text:"Внимание"};
      return {key:"problem",text:"Проблема"};
    }

    function employeeInfo(name,dateStr){
      const list=getEmployeesForDate(dateStr)||[];
      const item=list.find(x=>x && x.name===name);
      return item||null;
    }

    function responsibleFor(dateStr,service){
      const expected=typeof expectedForDate==="function"?expectedForDate(dateStr,service):null;
      const manager=String(expected?.manager||"").trim();
      if(!manager || isNoManagerValue(manager)) return null;
      const info=employeeInfo(manager,dateStr);
      return {name:manager,role:info?.role||((expected?.manager===expected?.master)?"master":"manager"),expected};
    }

    function responsibleForRow(row,fallback){
      const dateStr=String(row?.shift_date||"");
      const stored=String(row?.expected_manager||"").trim();
      if(!stored || isNoManagerValue(stored)) return fallback||null;
      const info=employeeInfo(stored,dateStr);
      const storedMaster=String(row?.expected_master||"").trim();
      return {name:stored,role:info?.role||((storedMaster&&stored===storedMaster)?"master":"manager"),expected:{manager:stored,master:storedMaster||null}};
    }

    function shouldCountOpening(dateStr,service,now){
      if(dateStr<now.date) return true;
      if(dateStr>now.date) return false;
      const nowMin=(Number(now.hour)||0)*60+(Number(now.minute)||0);
      return nowMin>=shiftMinutes(shiftStartForService(service))+10;
    }

    function shouldCountClosing(dateStr,service,now){
      if(dateStr<now.date) return true;
      if(dateStr>now.date) return false;
      const nowMin=(Number(now.hour)||0)*60+(Number(now.minute)||0);
      return nowMin>=shiftMinutes(shiftEndForService(service))+15;
    }

    function emptyStat(name,role=""){
      return {
        name,role,total:0,worked:0,ontime:0,late:0,lateMinutes:0,missed:0,replacements:0,
        early:0,earlyMinutes:0,unclosed:0,score:null,workedPercent:null,status:null,issues:[]
      };
    }

    function calculate(rows,{from,to,now}={}){
      const current=now||moscowParts();
      const start=String(from||"");
      const finish=String(to||"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(finish)||finish<start){
        return {employees:[],summary:{average:null,excellent:0,attention:0,violations:0,controlledShifts:0},from:start,to:finish};
      }

      const activeRows=new Map();
      const voidedPairs=new Set();
      (Array.isArray(rows)?rows:[]).forEach(row=>{
        const key=`${row.shift_date||""}|${row.service||""}`;
        if(row.voided_at){
          voidedPairs.add(key);
          return;
        }
        const existing=activeRows.get(key);
        if(!existing || String(row.updated_at||row.opened_at||"")>String(existing.updated_at||existing.opened_at||"")) activeRows.set(key,row);
      });

      const activationDates=new Map();
      activeRows.forEach(row=>{
        if(!row?.opened_at || !row?.opened_by || !row?.shift_date || !row?.service) return;
        const fallback=responsibleFor(String(row.shift_date),String(row.service));
        const resp=responsibleForRow(row,fallback);
        if(!resp || String(row.opened_by)!==resp.name) return;
        const date=String(row.shift_date);
        const previous=activationDates.get(resp.name);
        if(!previous || date<previous) activationDates.set(resp.name,date);
      });

      const stats=new Map();
      const ensure=(name,role="")=>{
        if(!stats.has(name)) stats.set(name,emptyStat(name,role));
        const stat=stats.get(name);
        if(!stat.role&&role) stat.role=role;
        return stat;
      };

      const rosterDate=finish<current.date?finish:current.date;
      (getEmployeesForDate(rosterDate)||[]).filter(x=>x&&x.name&&!x.inactive).forEach(x=>ensure(x.name,x.role||""));

      let date=start;
      while(date<=finish){
        for(const service of serviceNames()||[]){
          if(!shouldCountOpening(date,service,current)) continue;
          const key=`${date}|${service}`;
          const row=activeRows.get(key)||null;
          if(!row && voidedPairs.has(key)) continue;
          const fallbackResp=responsibleFor(date,service);
          const resp=row?responsibleForRow(row,fallbackResp):fallbackResp;
          if(!resp) continue;

          const activationDate=activationDates.get(resp.name);
          if(!activationDate || date<activationDate) continue;

          const stat=ensure(resp.name,resp.role||"");
          stat.total++;

          if(!row?.opened_at || String(row.opened_by||"")!==resp.name){
            stat.missed++;
            if(row?.opened_at && row.opened_by){
              stat.replacements++;
              stat.issues.push({date,service,type:"missed",text:`Смену открыл ${row.opened_by} вместо ${resp.name}`});
            }else{
              stat.issues.push({date,service,type:"missed",text:"Смена не была открыта ответственным"});
            }
            continue;
          }

          stat.worked++;
          const late=Math.max(0,Number(row.open_late_minutes)||0);
          if(late>0){
            stat.late++;
            stat.lateMinutes+=late;
            stat.issues.push({date,service,type:"late",text:`Опоздание +${late} мин`});
          }else{
            stat.ontime++;
          }

          if(row.closed_at){
            const early=Math.max(0,Number(row.early_close_minutes)||0);
            if(early>0 && String(row.closed_by||"")===resp.name){
              stat.early++;
              stat.earlyMinutes+=early;
              stat.issues.push({date,service,type:"early",text:`Закрытие раньше на ${early} мин`});
            }
          }else if(shouldCountClosing(date,service,current)){
            stat.unclosed++;
            stat.issues.push({date,service,type:"unclosed",text:"Смена не закрыта"});
          }
        }
        date=addDaysISO(date,1);
      }

      const employees=[...stats.values()].map(stat=>{
        if(stat.total>0){
          stat.score=Math.max(0,Math.min(100,100-stat.missed*20-stat.late*5-stat.early*5-stat.unclosed*10));
          stat.workedPercent=Math.round((stat.worked/stat.total)*100);
        }
        stat.status=statusForScore(stat.score);
        stat.issues.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.service).localeCompare(String(b.service),"ru"));
        return stat;
      }).sort((a,b)=>{
        if(a.score===null&&b.score!==null) return 1;
        if(a.score!==null&&b.score===null) return -1;
        if(a.score!==b.score) return (b.score??-1)-(a.score??-1);
        return a.name.localeCompare(b.name,"ru");
      });

      const scored=employees.filter(x=>x.score!==null);
      const average=scored.length?Math.round(scored.reduce((s,x)=>s+x.score,0)/scored.length):null;
      const summary={
        average,
        excellent:scored.filter(x=>x.score>=90).length,
        attention:scored.filter(x=>x.score<80).length,
        violations:scored.reduce((s,x)=>s+x.missed+x.late+x.early+x.unclosed,0),
        controlledShifts:scored.reduce((s,x)=>s+x.total,0)
      };
      return {employees,summary,from:start,to:finish};
    }

    function render(result,{summaryEl,listEl,noticeEl}={}){
      if(summaryEl){
        const s=result?.summary||{};
        summaryEl.innerHTML=`
          <div class="kpi-summary-card"><span>Средний KPI</span><b>${s.average===null||s.average===undefined?"—":s.average}</b></div>
          <div class="kpi-summary-card good"><span>90–100</span><b>${s.excellent||0}</b></div>
          <div class="kpi-summary-card ${s.attention?"bad":""}"><span>Ниже 80</span><b>${s.attention||0}</b></div>
          <div class="kpi-summary-card"><span>Нарушений</span><b>${s.violations||0}</b></div>`;
      }

      if(noticeEl){
        noticeEl.innerHTML=`KPI считает только <b>контролируемые смены</b>, где сотрудник назначен ответственным за открытие и закрытие точки. Пропуск начинает учитываться только после первого подтверждённого открытия этим сотрудником — отсутствие настроенного PIN/доступа не превращается в штраф. Присутствие мастера на Мобе пока отдельно не фиксируется и не снижает ему оценку.`;
      }

      if(!listEl) return;
      const employees=result?.employees||[];
      if(!employees.length){
        listEl.innerHTML='<div class="kpi-empty">За этот месяц данных пока нет.</div>';
        return;
      }

      listEl.innerHTML=employees.map(stat=>{
        const status=stat.status||statusForScore(stat.score);
        const scoreText=stat.score===null?"—":String(stat.score);
        const role=roleLabel(stat.role);
        const issues=stat.issues.slice(0,12);
        return `<details class="kpi-person ${status.key}">
          <summary>
            <div class="kpi-person-main"><b>${escapeHtml(stat.name)}</b><span>${escapeHtml(role)} · ${stat.total?`${stat.worked}/${stat.total} контролируемых смен`:`нет контролируемых смен`}</span></div>
            <div class="kpi-score ${status.key}"><b>${scoreText}</b><span>${escapeHtml(status.text)}</span></div>
          </summary>
          <div class="kpi-person-body">
            ${stat.total?`
              <div class="kpi-metrics">
                <div><span>Отработано</span><b>${stat.workedPercent}%</b></div>
                <div><span>Вовремя</span><b>${stat.ontime}</b></div>
                <div><span>Опоздания</span><b class="${stat.late?"warn":""}">${stat.late}${stat.lateMinutes?` · ${stat.lateMinutes} мин`:""}</b></div>
                <div><span>Пропуски</span><b class="${stat.missed?"bad":""}">${stat.missed}</b></div>
                <div><span>Ранние закрытия</span><b class="${stat.early?"warn":""}">${stat.early}</b></div>
                <div><span>Не закрыты</span><b class="${stat.unclosed?"bad":""}">${stat.unclosed}</b></div>
              </div>
              <div class="kpi-formula">Расчёт: 100 − 20 за пропуск − 5 за опоздание − 5 за раннее закрытие − 10 за незакрытую смену.</div>
              ${issues.length?`<div class="kpi-issues"><b>Что повлияло на KPI</b>${issues.map(i=>`<div class="kpi-issue ${i.type}"><span>${escapeHtml(i.date)} · ${escapeHtml(i.service)}</span><b>${escapeHtml(i.text)}</b></div>`).join("")}</div>`:'<div class="kpi-noissues">Нарушений за период нет.</div>'}
            `:'<div class="kpi-noissues">В этом месяце сотрудник не был ответственным за открытие/закрытие точки. Оценка не выставляется.</div>'}
          </div>
        </details>`;
      }).join("");
    }

    return {monthRange,statusForScore,calculate,render};
  }

  global.MAKpi={create};
})(typeof window!=="undefined" ? window : globalThis);
