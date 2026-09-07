from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)

# index.html
p = Path("index.html")
html = p.read_text(encoding="utf-8")
button_old = '<button class="secondary" id="openKpiFromToday">KPI сотрудников</button>'
button_new = button_old + '\n            <button class="secondary" id="openOwnerReport">Отчёт владельца</button>'
html = replace_once(html, button_old, button_new, "owner report button")

modal = r'''
<div class="modal hidden" id="ownerReportModal">
  <div class="sheet owner-report-sheet">
    <div class="sheet-head owner-report-head">
      <div>
        <h2>Отчёт владельца</h2>
        <div class="owner-report-period" id="ownerReportPeriod">Последние 7 дней</div>
      </div>
      <button class="close" id="closeOwnerReport" aria-label="Закрыть">×</button>
    </div>
    <div class="owner-report-loading hidden" id="ownerReportLoading">Собираем отчёт…</div>
    <div class="owner-report-summary" id="ownerReportSummary"></div>
    <div class="owner-report-best" id="ownerReportBest"></div>
    <h3 class="owner-report-title">Сотрудники</h3>
    <div class="owner-report-people" id="ownerReportPeople"></div>
    <h3 class="owner-report-title">Требует внимания</h3>
    <div class="owner-report-attention" id="ownerReportAttention"></div>
    <div class="owner-report-actions">
      <button class="secondary" id="ownerReportOpenKpi">Открыть KPI</button>
      <button class="primary" id="ownerReportRefresh">Обновить</button>
    </div>
  </div>
</div>

'''
script_anchor = '<script src="schedule.js"></script>'
if 'id="ownerReportModal"' not in html:
    html = replace_once(html, script_anchor, modal + script_anchor, "owner report modal")
p.write_text(html, encoding="utf-8")

# app.js
p = Path("app.js")
app = p.read_text(encoding="utf-8")
app = replace_once(app, '  let kpiLoadSeq = 0;\n', '  let kpiLoadSeq = 0;\n  let ownerReportLoadSeq = 0;\n', "owner report sequence")

owner_function = r'''
  async function loadOwnerReport(){
    const seq=++ownerReportLoadSeq;
    const modal=$("ownerReportModal");
    const periodEl=$("ownerReportPeriod"),summaryEl=$("ownerReportSummary"),bestEl=$("ownerReportBest");
    const peopleEl=$("ownerReportPeople"),attentionEl=$("ownerReportAttention"),loadingEl=$("ownerReportLoading");
    if(!modal||!summaryEl||!peopleEl||!attentionEl) return;

    if(!isAdmin()){
      modal.classList.add("hidden");
      openLoginModal();
      toast("Отчёт владельца доступен после входа администратора");
      return;
    }

    const now=moscowParts();
    const to=now.date;
    const from=addDaysISO(to,-6);
    const dateLabel=value=>{
      const parts=String(value||"").split("-");
      return parts.length===3?`${parts[2]}.${parts[1]}.${parts[0]}`:String(value||"");
    };
    if(periodEl) periodEl.textContent=`Последние 7 дней · ${dateLabel(from)}–${dateLabel(to)}`;
    if(loadingEl) loadingEl.classList.remove("hidden");
    summaryEl.innerHTML="";
    if(bestEl) bestEl.innerHTML="";
    peopleEl.innerHTML="";
    attentionEl.innerHTML="";

    try{
      const token=await getAdminToken();
      if(!token) throw new Error("Сессия администратора закончилась");
      const historyFrom=from<"2026-09-01"?from:"2026-09-01";
      const query=`/rest/v1/${SHIFT_TABLE}?select=*&shift_date=gte.${historyFrom}&shift_date=lte.${to}&order=shift_date.asc,service.asc&limit=2000`;
      const res=await authFetch(query,{method:"GET",headers:{Authorization:"Bearer "+token}});
      if(!res.ok) throw new Error(await res.text());
      const rows=await res.json();
      if(seq!==ownerReportLoadSeq) return;

      const result=kpiCore.calculate(rows,{from,to,now});
      const employees=(result.employees||[]).filter(x=>x.score!==null);
      const late=employees.reduce((s,x)=>s+x.late,0);
      const missed=employees.reduce((s,x)=>s+x.missed,0);
      const early=employees.reduce((s,x)=>s+x.early,0);
      const unclosed=employees.reduce((s,x)=>s+x.unclosed,0);
      const average=result.summary?.average;

      summaryEl.innerHTML=`
        <div class="owner-report-stat"><span>Средний KPI</span><b>${average===null||average===undefined?"—":average}</b></div>
        <div class="owner-report-stat ${late?"warn":""}"><span>Опоздания</span><b>${late}</b></div>
        <div class="owner-report-stat ${missed?"bad":""}"><span>Пропуски</span><b>${missed}</b></div>
        <div class="owner-report-stat ${unclosed?"bad":""}"><span>Не закрыты</span><b>${unclosed}</b></div>`;

      const ranked=employees.slice().sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,"ru"));
      const best=ranked[0]||null;
      if(bestEl){
        bestEl.innerHTML=best
          ? `<span>Лучший результат за период</span><b>${escapeHtml(best.name)} · KPI ${best.score}</b>`
          : `<span>За последние 7 дней пока нет контролируемых смен.</span>`;
      }

      peopleEl.innerHTML=employees.length?employees.map(stat=>{
        const issueTotal=stat.late+stat.missed+stat.early+stat.unclosed;
        const status=stat.status?.text||"—";
        return `<div class="owner-report-person ${stat.score<80?"problem":stat.score<90?"attention":"good"}">
          <div><b>${escapeHtml(stat.name)}</b><span>${escapeHtml(status)} · ${stat.worked}/${stat.total} смен</span></div>
          <div class="owner-report-person-score"><b>${stat.score}</b><span>${issueTotal?`${issueTotal} наруш.`:"без нарушений"}</span></div>
        </div>`;
      }).join(""):'<div class="owner-report-empty">Данных для оценки сотрудников пока нет.</div>';

      const needs=employees.filter(x=>x.score<80||x.missed>0||x.unclosed>0).sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name,"ru"));
      attentionEl.innerHTML=needs.length?needs.map(stat=>{
        const reasons=[];
        if(stat.missed) reasons.push(`пропусков: ${stat.missed}`);
        if(stat.unclosed) reasons.push(`не закрыто: ${stat.unclosed}`);
        if(stat.late) reasons.push(`опозданий: ${stat.late}`);
        if(stat.early) reasons.push(`ранних закрытий: ${stat.early}`);
        return `<div class="owner-report-alert"><b>${escapeHtml(stat.name)} · KPI ${stat.score}</b><span>${escapeHtml(reasons.join(" · ")||"KPI ниже нормы")}</span></div>`;
      }).join(""):'<div class="owner-report-ok">За последние 7 дней критичных нарушений нет.</div>';

      if(early && !needs.some(x=>x.early)){
        attentionEl.insertAdjacentHTML("beforeend",`<div class="owner-report-note">Ранних закрытий за период: ${early}</div>`);
      }
    }catch(e){
      if(seq!==ownerReportLoadSeq) return;
      logAppError("owner report load",e,{period:`${from}:${to}`});
      summaryEl.innerHTML="";
      if(bestEl) bestEl.innerHTML="";
      peopleEl.innerHTML='<div class="owner-report-empty">Не удалось загрузить отчёт.</div>';
      attentionEl.innerHTML='<div class="owner-report-alert"><b>Ошибка загрузки</b><span>Нажми «Обновить».</span></div>';
    }finally{
      if(seq===ownerReportLoadSeq && loadingEl) loadingEl.classList.add("hidden");
    }
  }

'''
if 'async function loadOwnerReport()' not in app:
    app = replace_once(app, '  async function loadHistory(){\n', owner_function + '  async function loadHistory(){\n', "owner report function")

handler_anchor = '  if($("openKpiFromToday")) $("openKpiFromToday").onclick=()=>switchTab("kpi");\n'
handler_block = handler_anchor + '''  if($("openOwnerReport")) $("openOwnerReport").onclick=()=>{ $("ownerReportModal").classList.remove("hidden"); loadOwnerReport(); };\n  if($("closeOwnerReport")) $("closeOwnerReport").onclick=()=>$("ownerReportModal").classList.add("hidden");\n  if($("ownerReportModal")) $("ownerReportModal").addEventListener("click",e=>{ if(e.target===$("ownerReportModal")) $("ownerReportModal").classList.add("hidden"); });\n  if($("ownerReportRefresh")) $("ownerReportRefresh").onclick=loadOwnerReport;\n  if($("ownerReportOpenKpi")) $("ownerReportOpenKpi").onclick=()=>{ $("ownerReportModal").classList.add("hidden"); switchTab("kpi"); };\n'''
app = replace_once(app, handler_anchor, handler_block, "owner report handlers")
p.write_text(app, encoding="utf-8")

# styles.css
p = Path("styles.css")
css = p.read_text(encoding="utf-8")
style_marker = "/* --- Отчёт владельца --- */"
if style_marker not in css:
    css += r'''

/* --- Отчёт владельца --- */
.today-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.owner-report-sheet{width:min(100%,760px)}
.owner-report-period{font-size:12px;color:var(--muted);margin-top:4px}
.owner-report-loading{padding:14px 0;color:var(--muted);font-size:13px}
.owner-report-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0 10px}
.owner-report-stat{border:1px solid var(--line);background:#f8fafc;border-radius:14px;padding:11px}
.owner-report-stat span{display:block;color:var(--muted);font-size:11px;margin-bottom:5px}
.owner-report-stat b{font-size:22px;color:#24324a}
.owner-report-stat.warn{background:#fff8e8;border-color:#f5d28a}.owner-report-stat.warn b{color:#8a5a00}
.owner-report-stat.bad{background:#fff1f1;border-color:#f2bcbc}.owner-report-stat.bad b{color:#a61b1b}
.owner-report-best{border:1px solid #bfe7cb;background:#edf9f1;border-radius:14px;padding:11px 12px;margin-bottom:14px}
.owner-report-best span{display:block;color:#39704d;font-size:11px;margin-bottom:3px}.owner-report-best b{color:#14532d;font-size:15px}
.owner-report-title{margin:15px 0 8px!important;color:#24324a!important;font-size:14px!important}
.owner-report-people{display:grid;gap:8px}
.owner-report-person{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:14px;padding:11px 12px;background:#fff}
.owner-report-person>div:first-child b{display:block;font-size:14px}.owner-report-person>div:first-child span{display:block;color:var(--muted);font-size:11px;margin-top:3px}
.owner-report-person-score{text-align:right}.owner-report-person-score b{display:block;font-size:20px}.owner-report-person-score span{display:block;color:var(--muted);font-size:10px;margin-top:2px}
.owner-report-person.good{border-left:4px solid #4da66a}.owner-report-person.attention{border-left:4px solid #d7a62a}.owner-report-person.problem{border-left:4px solid #cf4b4b}
.owner-report-attention{display:grid;gap:8px}.owner-report-alert{border:1px solid #f2bcbc;background:#fff1f1;border-radius:14px;padding:11px 12px}.owner-report-alert b{display:block;color:#a61b1b;font-size:13px}.owner-report-alert span{display:block;color:#7a3333;font-size:11px;margin-top:4px}
.owner-report-ok{border:1px solid #bfe7cb;background:#edf9f1;color:#14532d;border-radius:14px;padding:12px;font-size:12px;font-weight:700}
.owner-report-note,.owner-report-empty{border:1px solid var(--line);background:#f8fafc;color:var(--muted);border-radius:14px;padding:12px;font-size:12px}
.owner-report-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}
@media(max-width:600px){
  .today-head{display:block}.today-head-actions{margin-top:10px;display:grid;grid-template-columns:1fr 1fr}.today-head-actions button{padding:9px 8px;font-size:12px}
  .owner-report-summary{grid-template-columns:1fr 1fr}.owner-report-sheet{max-height:92vh}.owner-report-actions{grid-template-columns:1fr}
}
'''
p.write_text(css, encoding="utf-8")

# tests/run-tests.js
p = Path("tests/run-tests.js")
tests = p.read_text(encoding="utf-8")
test_anchor = '// ---- Project structure ----\n'
new_tests = r'''
test("Отчёт владельца: кнопка и окно присутствуют в интерфейсе",()=>{
  const html=fs.readFileSync("index.html","utf8");
  assert(html.includes('id="openOwnerReport"'));
  assert(html.includes('id="ownerReportModal"'));
  assert(html.includes('id="ownerReportAttention"'));
});

test("Отчёт владельца: использует KPI и последние 7 дней",()=>{
  const app=fs.readFileSync("app.js","utf8");
  assert(app.includes("async function loadOwnerReport()"));
  assert(app.includes("const from=addDaysISO(to,-6)"));
  assert(app.includes("kpiCore.calculate(rows,{from,to,now})"));
  assert(app.includes('logAppError("owner report load"'));
});

'''
if 'Отчёт владельца: кнопка и окно присутствуют' not in tests:
    tests = replace_once(tests, test_anchor, new_tests + test_anchor, "owner report tests")
p.write_text(tests, encoding="utf-8")

print("owner report patches applied")
