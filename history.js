(function(global){
  "use strict";

  function create(options={}){
    const $=options.getEl;
    const moscowParts=options.moscowParts;
    const addDaysISO=options.addDaysISO;
    const loadHistory=options.loadHistory;
    const formatMoscowTime=options.formatMoscowTime;
    const serviceKeyForName=options.serviceKeyForName;
    const allHistoricalManagerNames=options.allHistoricalManagerNames;
    const escapeHtml=options.escapeHtml;
    const getSettings=options.getSettings;
    const isAdmin=options.isAdmin;
    const openEditShift=options.openEditShift;

  function monthStartISO(dateStr){
    const [y,m]=dateStr.split("-").map(Number);
    return `${y}-${String(m).padStart(2,"0")}-01`;
  }

  function setHistoryQuickRange(range,load=true){
    const today=moscowParts().date;
    let from=today,to=today;

    if(range==="7days"){
      from=addDaysISO(today,-6);
    }else if(range==="month"){
      from=monthStartISO(today);
    }

    $("historyFrom").value=from;
    $("historyTo").value=to;

    document.querySelectorAll("#historyQuick [data-range]").forEach(b=>{
      b.classList.toggle("active",b.dataset.range===range);
    });
    if($("historyCustomRange")) $("historyCustomRange").classList.add("hidden");
    if($("historyCustomBtn")) $("historyCustomBtn").classList.remove("active");

    if(load) loadHistory();
  }

  function historySourceText(row,kind){
    const source=kind==="open" ? row.opened_source : row.closed_source;
    const employee=kind==="open" ? row.opened_by : row.closed_by;
    if(!source) return "";

    if(String(source).startsWith("admin:")){
      return `${kind==="open"?"Открыто":"Закрыто"} администратором за ${employee||"сотрудника"}`;
    }
    if(String(source).startsWith("device:")){
      const label=String(source).slice("device:".length);
      return `Подтверждено на устройстве: ${label}`;
    }
    return "";
  }

  function historyServiceClass(service){
    const key=serviceKeyForName(service);
    return key ? `service-${key}` : "";
  }

  function historyDateText(dateStr){
    if(!dateStr) return "—";
    const [y,m,d]=String(dateStr).split("-").map(Number);
    if(!y||!m||!d) return String(dateStr);
    return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"}).format(new Date(y,m-1,d));
  }

  function historyHasMismatch(row){
    return !!(row.opened_by && row.expected_manager && row.opened_by!==row.expected_manager);
  }

  function historyIsProblem(row){
    if(row.voided_at) return true;
    if((row.open_late_minutes||0)>0) return true;
    if((row.early_close_minutes||0)>0) return true;
    if(row.opened_at && !row.closed_at) return true;
    if(historyHasMismatch(row)) return true;
    return false;
  }

  function historyStatus(row){
    if(row.voided_at) return {text:"Аннулирована",cls:"voided"};
    if(row.opened_at && !row.closed_at) return {text:"Не закрыта",cls:"bad"};
    if((row.open_late_minutes||0)>0) return {text:`Опоздание +${row.open_late_minutes} мин`,cls:"warn"};
    if((row.early_close_minutes||0)>0) return {text:`Раннее закрытие`,cls:"warn"};
    if(historyHasMismatch(row)) return {text:"Не тот менеджер",cls:"warn"};
    return {text:"Вовремя",cls:"ok"};
  }

  function historyCompactLine(row){
    const who=row.opened_by||row.expected_manager||"—";
    const open=formatMoscowTime(row.opened_at);
    const close=row.closed_at?formatMoscowTime(row.closed_at):"—";
    return `${who} · ${open} → ${close}`;
  }

  function fillEditManagerSelect(select,rowValue,allowEmpty=false){
    if(!select) return;
    const names=[...new Set([
      ...(allHistoricalManagerNames()||[]),
      rowValue||""
    ].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru"));

    select.innerHTML=(allowEmpty?'<option value="">— Не закрыта —</option>':"")+
      names.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

    if(rowValue && [...select.options].some(o=>o.value===rowValue)){
      select.value=rowValue;
    }else if(allowEmpty && !rowValue){
      select.value="";
    }
  }

  function renderHistoryStats(rows){
    const root=$("historyStats");
    if(!root) return;

    const active=rows.filter(r=>!r.voided_at);
    const total=active.length;
    const late=active.filter(r=>(r.open_late_minutes||0)>0).length;
    const ontime=active.filter(r=>
      r.opened_at &&
      (r.open_late_minutes||0)===0 &&
      !historyHasMismatch(r)
    ).length;
    const unclosed=active.filter(r=>r.opened_at&&!r.closed_at).length;

    const byEmployee={};
    active.forEach(r=>{
      const name=r.opened_by||r.expected_manager||"Не указан";
      if(!byEmployee[name]) byEmployee[name]={total:0,late:0,ontime:0,unclosed:0};
      byEmployee[name].total++;
      if((r.open_late_minutes||0)>0) byEmployee[name].late++;
      if(r.opened_at && (r.open_late_minutes||0)===0 && !historyHasMismatch(r)) byEmployee[name].ontime++;
      if(r.opened_at&&!r.closed_at) byEmployee[name].unclosed++;
    });

    const people=Object.entries(byEmployee)
      .sort((a,b)=>b[1].total-a[1].total);

    root.innerHTML=`
      <div class="history-stats-grid">
        <div class="history-stat"><b>${total}</b><span>всего смен</span></div>
        <div class="history-stat good"><b>${ontime}</b><span>вовремя</span></div>
        <div class="history-stat ${late?"alert":""}"><b>${late}</b><span>опозданий</span></div>
        <div class="history-stat ${unclosed?"alert":""}"><b>${unclosed}</b><span>не закрыты</span></div>
      </div>
      ${people.length?`
        <div class="discipline-title">
          <b>Дисциплина ответственных</b>
          <span>за выбранный период</span>
        </div>
        <div class="discipline-table-wrap">
          <table class="discipline-table">
            <thead>
              <tr><th>Менеджер</th><th>Смен</th><th>Вовремя</th><th>Опозд.</th><th>Не закрыты</th></tr>
            </thead>
            <tbody>
              ${people.map(([name,s])=>`
                <tr>
                  <td>${escapeHtml(name)}</td>
                  <td>${s.total}</td>
                  <td class="${s.ontime?"discipline-good":""}">${s.ontime}</td>
                  <td class="${s.late?"discipline-bad":""}">${s.late}</td>
                  <td class="${s.unclosed?"discipline-bad":""}">${s.unclosed}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `:""}
    `;
  }

  function defaultHistoryDates(){
    setHistoryQuickRange("month",false);
  }

  function fillHistoryFilters(){
    const sv=$("historyService"), emp=$("historyEmployee"); if(!sv||!emp) return;
    const svv=sv.value, ev=emp.value;
    sv.innerHTML=`<option value="">Все сервисы</option><option>${escapeHtml(getSettings().service1)}</option><option>${escapeHtml(getSettings().service2)}</option>`;
    emp.innerHTML='<option value="">Все ответственные</option>'+allHistoricalManagerNames().map(n=>`<option>${escapeHtml(n)}</option>`).join("");
    if([...sv.options].some(o=>o.value===svv)) sv.value=svv; if([...emp.options].some(o=>o.value===ev)) emp.value=ev;
  }

  function renderHistory(rows){
    const root=$("historyList");
    if(!rows.length){
      root.innerHTML='<div class="history-empty">За выбранный период записей нет.</div>';
      return;
    }

    root.innerHTML=rows.map(r=>{
      const status=historyStatus(r);
      const serviceClass=historyServiceClass(r.service);
      const openSource=historySourceText(r,"open");
      const closeSource=historySourceText(r,"close");
      const mismatch=historyHasMismatch(r);

      if(r.voided_at){
        return `<details class="history-item ${serviceClass}">
          <summary class="history-summary">
            <div class="history-summary-main">
              <div class="history-summary-top">
                <span class="history-summary-service">${escapeHtml(r.service)}</span>
                <span class="history-summary-date">· ${escapeHtml(historyDateText(r.shift_date))}</span>
              </div>
              <div class="history-summary-line">${escapeHtml(r.opened_by||r.expected_manager||"—")} · ${formatMoscowTime(r.opened_at)}</div>
            </div>
            <span class="history-summary-status voided">Аннулирована</span>
          </summary>
          <div class="history-details">
            <div class="history-details-grid">
              <div class="history-detail-card">
                <b>Была открыта</b>
                ${escapeHtml(r.opened_by||"—")} · ${formatMoscowTime(r.opened_at)}
                ${openSource?`<div class="history-detail-meta">${escapeHtml(openSource)}</div>`:""}
              </div>
              <div class="history-detail-card">
                <b>Аннулирование</b>
                ${formatMoscowTime(r.voided_at)}
                <div class="history-detail-meta">Кем: ${escapeHtml(r.voided_by||"Администратор")}</div>
                <div class="history-detail-meta">${escapeHtml(r.void_reason||"Причина не указана")}</div>
              </div>
            </div>
          </div>
        </details>`;
      }

      const late=(r.open_late_minutes||0)>0;
      const early=(r.early_close_minutes||0)>0;
      const unclosed=r.opened_at&&!r.closed_at;

      return `<details class="history-item ${serviceClass}">
        <summary class="history-summary">
          <div class="history-summary-main">
            <div class="history-summary-top">
              <span class="history-summary-service">${escapeHtml(r.service)}</span>
              <span class="history-summary-date">· ${escapeHtml(historyDateText(r.shift_date))}</span>
            </div>
            <div class="history-summary-line">${escapeHtml(historyCompactLine(r))}</div>
          </div>
          <span class="history-summary-status ${status.cls}">${escapeHtml(status.text)}</span>
        </summary>

        <div class="history-details">
          <div class="history-details-grid">
            <div class="history-detail-card">
              <b>Открытие</b>
              ${escapeHtml(r.opened_by||"—")} · ${formatMoscowTime(r.opened_at)}
              ${late?`<div class="history-status-line warn" style="margin:5px 0 0">Опоздание +${r.open_late_minutes} мин</div>`:`<div class="history-status-line ok" style="margin:5px 0 0">Вовремя</div>`}
              ${mismatch?`<div class="history-mismatch">По графику: ${escapeHtml(r.expected_manager)}</div>`:""}
              ${openSource?`<div class="history-detail-meta">${escapeHtml(openSource)}</div>`:""}
            </div>

            <div class="history-detail-card">
              <b>Закрытие</b>
              ${escapeHtml(r.closed_by||"—")} · ${formatMoscowTime(r.closed_at)}
              ${unclosed
                ? `<div class="history-status-line bad" style="margin:5px 0 0">Смена не закрыта</div>`
                : early
                  ? `<div class="history-status-line warn" style="margin:5px 0 0">Раньше на ${r.early_close_minutes} мин</div>`
                  : `<div class="history-status-line ok" style="margin:5px 0 0">Закрыта</div>`
              }
              ${closeSource?`<div class="history-detail-meta">${escapeHtml(closeSource)}</div>`:""}
            </div>
          </div>

          ${isAdmin()?`
            <div class="history-detail-actions">
              <button class="secondary edit-shift-btn" data-id="${r.id}">Исправить смену</button>
            </div>
          `:""}
        </div>
      </details>`;
    }).join("");

    root.querySelectorAll(".edit-shift-btn").forEach(b=>{
      b.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        openEditShift(rows.find(r=>String(r.id)===b.dataset.id));
      };
    });
  }


    return {
      monthStartISO,setHistoryQuickRange,historySourceText,historyServiceClass,historyDateText,
      historyHasMismatch,historyIsProblem,historyStatus,historyCompactLine,fillEditManagerSelect,
      renderHistoryStats,defaultHistoryDates,fillHistoryFilters,renderHistory
    };
  }

  global.MAHistory={create};
})(typeof window!=="undefined" ? window : globalThis);
