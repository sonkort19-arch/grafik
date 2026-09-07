from pathlib import Path
import re

ROOT=Path('.')

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old,new,1)

# ---------- index.html ----------
index=read('index.html')

old_today='''        <div class="today-head">\n          <div><h2>Состояние смен</h2><div class="today-date" id="todayDateLabel">—</div></div>\n          <button class="secondary quick-replace-btn hidden" id="quickReplaceBtn">Замена сегодня</button>\n        </div>'''
new_today='''        <div class="today-head">\n          <div><h2>Состояние смен</h2><div class="today-date" id="todayDateLabel">—</div></div>\n          <div class="today-head-actions">\n            <button class="secondary" id="openKpiFromToday">KPI сотрудников</button>\n            <button class="secondary quick-replace-btn hidden" id="quickReplaceBtn">Замена сегодня</button>\n          </div>\n        </div>'''
index=replace_once(index,old_today,new_today,'today KPI button')

old_history='''        <div class="history-page-head">\n          <div>\n            <h2>История смен</h2>\n            <div class="history-page-sub">Контроль дисциплины и фактических открытий/закрытий</div>\n          </div>\n        </div>'''
new_history='''        <div class="history-page-head">\n          <div>\n            <h2>История смен</h2>\n            <div class="history-page-sub">Контроль дисциплины и фактических открытий/закрытий</div>\n          </div>\n          <button class="secondary" id="openKpiFromHistory">KPI сотрудников</button>\n        </div>'''
index=replace_once(index,old_history,new_history,'history KPI button')

kpi_page='''    <section id="kpiPage" class="hidden">\n      <div class="section kpi-shell">\n        <div class="kpi-head">\n          <div>\n            <h2>KPI сотрудников</h2>\n            <div class="history-page-sub">Автоматическая оценка дисциплины по ответственным сменам</div>\n          </div>\n          <button class="secondary" id="kpiBackBtn">Назад</button>\n        </div>\n\n        <div class="kpi-toolbar">\n          <label>Месяц<input type="month" id="kpiMonth" aria-label="Месяц KPI"></label>\n          <button class="secondary" id="kpiRefreshBtn" type="button">Обновить</button>\n        </div>\n\n        <div class="kpi-notice" id="kpiNotice"></div>\n        <div class="kpi-summary" id="kpiSummary"></div>\n        <div class="kpi-loading hidden" id="kpiLoading">Считаем KPI…</div>\n        <div class="kpi-list" id="kpiList"></div>\n      </div>\n    </section>\n\n'''
marker='    <section id="walletsPage" class="hidden">'
if marker not in index: raise SystemExit('wallets marker not found')
index=index.replace(marker,kpi_page+marker,1)

mobile_history='''      <button class="secondary mobile-more-action" data-mobile-more-tab="history"><span class="mobile-more-icon">◷</span><span><b>История</b><small>Смены и нарушения</small></span></button>'''
mobile_kpi='''      <button class="secondary mobile-more-action" data-mobile-more-tab="kpi"><span class="mobile-more-icon">◎</span><span><b>KPI сотрудников</b><small>Дисциплина и нарушения</small></span></button>\n'''+mobile_history
index=replace_once(index,mobile_history,mobile_kpi,'mobile KPI action')

script_marker='<script src="history.js"></script>\n<script src="safety.js"></script>'
script_new='<script src="history.js"></script>\n<script src="kpi.js"></script>\n<script src="safety.js"></script>'
index=replace_once(index,script_marker,script_new,'kpi script order')
write('index.html',index)

# ---------- styles.css ----------
styles=read('styles.css')
if '/* KPI_EMPLOYEES_V1 */' in styles:
    raise SystemExit('KPI styles already present')
styles += r'''

/* KPI_EMPLOYEES_V1 */
.today-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.kpi-shell{max-width:1100px;margin:0 auto}
.kpi-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.kpi-head h2{margin:0 0 4px}
.kpi-toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.kpi-toolbar label{display:grid;gap:5px;font-size:12px;font-weight:700;color:var(--muted)}
.kpi-toolbar input{min-height:42px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font:inherit}
.kpi-notice{padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--soft);font-size:13px;line-height:1.45;margin-bottom:14px}
.kpi-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.kpi-summary-card{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:13px 14px;display:grid;gap:4px}
.kpi-summary-card span{font-size:12px;color:var(--muted)}
.kpi-summary-card b{font-size:25px;line-height:1}
.kpi-summary-card.good b{color:#178447}.kpi-summary-card.bad b{color:#c73434}
.kpi-loading,.kpi-empty{padding:20px;text-align:center;color:var(--muted)}
.kpi-list{display:grid;gap:10px}
.kpi-person{border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden}
.kpi-person summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 15px}
.kpi-person summary::-webkit-details-marker{display:none}
.kpi-person-main{display:grid;gap:3px;min-width:0}.kpi-person-main>b{font-size:16px}.kpi-person-main>span{font-size:12px;color:var(--muted)}
.kpi-score{min-width:82px;text-align:right;display:grid;gap:2px}.kpi-score>b{font-size:24px;line-height:1}.kpi-score>span{font-size:11px;font-weight:700}
.kpi-score.excellent b,.kpi-score.excellent span{color:#178447}.kpi-score.normal b,.kpi-score.normal span{color:#2366b1}.kpi-score.attention b,.kpi-score.attention span{color:#a66d00}.kpi-score.problem b,.kpi-score.problem span{color:#c73434}.kpi-score.nodata b,.kpi-score.nodata span{color:var(--muted)}
.kpi-person-body{border-top:1px solid var(--line);padding:14px 15px;background:var(--soft)}
.kpi-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.kpi-metrics>div{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:10px;display:grid;gap:3px}.kpi-metrics span{font-size:11px;color:var(--muted)}.kpi-metrics b{font-size:14px}.kpi-metrics b.warn{color:#a66d00}.kpi-metrics b.bad{color:#c73434}
.kpi-formula{font-size:12px;color:var(--muted);line-height:1.45;margin:12px 0}
.kpi-issues{display:grid;gap:7px}.kpi-issues>b{font-size:13px;margin-bottom:2px}.kpi-issue{display:flex;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:9px;background:var(--card);border:1px solid var(--line);font-size:12px}.kpi-issue span{color:var(--muted)}.kpi-issue.bad b,.kpi-issue.missed b,.kpi-issue.unclosed b{color:#c73434}.kpi-issue.late b,.kpi-issue.early b{color:#a66d00}
.kpi-noissues{padding:10px 0;color:var(--muted);font-size:13px}
@media(max-width:720px){
  .today-head-actions{width:100%;justify-content:flex-start}
  .kpi-head{align-items:center}.kpi-head .secondary{white-space:nowrap}
  .kpi-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
  .kpi-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  .kpi-person summary{padding:13px 12px}.kpi-person-body{padding:12px}
  .kpi-issue{display:grid;gap:3px}
}
'''
write('styles.css',styles)

# ---------- app.js ----------
app=read('app.js')
app=replace_once(app,'  let historyLoadSeq = 0;\n','  let historyLoadSeq = 0;\n  let kpiLoadSeq = 0;\n','kpi load seq')

shift_block='''  const {\n    expectedForDate,\n    shiftMinutes,\n    shiftStartForService,\n    shiftEndForService,\n    isValidShiftPin\n  }=window.MAShifts.create({\n    getSettings:()=>settings,\n    monthIndexForYearMonth,\n    getDaySchedule:()=>daySchedule\n  });'''
kpi_init=shift_block+'''\n\n  const kpiCore=window.MAKpi.create({\n    expectedForDate,\n    serviceNames:()=>[settings.service1,settings.service2].filter(Boolean),\n    getEmployeesForDate:dateStr=>employeesForDate(dateObjectFromKey(dateStr)),\n    isNoManagerValue,\n    shiftStartForService,\n    shiftEndForService,\n    shiftMinutes,\n    moscowParts,\n    escapeHtml\n  });'''
app=replace_once(app,shift_block,kpi_init,'kpi core init')

load_kpi=r'''  async function loadKpi(){
    const seq=++kpiLoadSeq;
    const list=$("kpiList"),summary=$("kpiSummary"),notice=$("kpiNotice"),loading=$("kpiLoading");
    if(!list||!summary) return;

    if(!isAdmin()){
      summary.innerHTML="";
      list.innerHTML='<div class="kpi-empty">Войди как администратор, чтобы смотреть KPI сотрудников.</div>';
      if(notice) notice.textContent="KPI доступен только владельцу/администратору.";
      return;
    }
    if(!cloudConfigured()){
      summary.innerHTML="";
      list.innerHTML='<div class="kpi-empty">KPI требует подключённое облако смен.</div>';
      if(notice) notice.textContent="Без фактических открытий и закрытий KPI считать нельзя.";
      return;
    }

    const month=$("kpiMonth")?.value || moscowParts().date.slice(0,7);
    const range=kpiCore.monthRange(month);
    if(!range){ list.innerHTML='<div class="kpi-empty">Выбери месяц.</div>'; return; }
    if($("kpiMonth") && !$("kpiMonth").value) $("kpiMonth").value=month;

    if(loading) loading.classList.remove("hidden");
    list.innerHTML="";
    try{
      const token=await getAdminToken();
      const query=`/rest/v1/${SHIFT_TABLE}?select=*&shift_date=gte.${range.from}&shift_date=lte.${range.to}&order=shift_date.asc,service.asc&limit=250`;
      const res=await authFetch(query,{method:"GET",headers:{Authorization:"Bearer "+token}});
      if(!res.ok) throw new Error(await res.text());
      const rows=await res.json();
      if(seq!==kpiLoadSeq) return;
      const result=kpiCore.calculate(rows,{from:range.from,to:range.to,now:moscowParts()});
      kpiCore.render(result,{summaryEl:summary,listEl:list,noticeEl:notice});
    }catch(e){
      if(seq!==kpiLoadSeq) return;
      logAppError("kpi load",e,{month});
      summary.innerHTML="";
      list.innerHTML='<div class="kpi-empty">Не удалось загрузить KPI. Нажми «Обновить».</div>';
      if(notice) notice.textContent=e?.message||"Ошибка загрузки KPI";
    }finally{
      if(seq===kpiLoadSeq && loading) loading.classList.add("hidden");
    }
  }

'''
marker='  async function loadHistory(){'
if marker not in app: raise SystemExit('loadHistory marker not found')
app=app.replace(marker,load_kpi+marker,1)

vars_old='''    const desktopCal=tab==="desktopCalendar";\n    const hist=tab==="history";\n    const sett=tab==="settings";'''
vars_new='''    const desktopCal=tab==="desktopCalendar";\n    const hist=tab==="history";\n    const kpi=tab==="kpi";\n    const sett=tab==="settings";'''
app=replace_once(app,vars_old,vars_new,'switch kpi variable')

page_old='''    $("historyPage").classList.toggle("hidden",!hist);\n    $("settingsPage").classList.toggle("hidden",!sett);'''
page_new='''    $("historyPage").classList.toggle("hidden",!hist);\n    $("kpiPage").classList.toggle("hidden",!kpi);\n    $("settingsPage").classList.toggle("hidden",!sett);'''
app=replace_once(app,page_old,page_new,'switch kpi page')

hist_block='''    if(hist){\n      fillHistoryFilters();\n      if(!$("historyFrom").value) defaultHistoryDates();\n      loadHistory();\n    }'''
hist_new=hist_block+'''\n    if(kpi){\n      if($("kpiMonth") && !$("kpiMonth").value) $("kpiMonth").value=moscowParts().date.slice(0,7);\n      loadKpi();\n    }'''
app=replace_once(app,hist_block,hist_new,'switch kpi loader')

local_old='''    $("historyPage").classList.add("hidden");\n    $("settingsPage").classList.toggle("hidden",sched);'''
local_new='''    $("historyPage").classList.add("hidden");\n    $("kpiPage").classList.add("hidden");\n    $("settingsPage").classList.toggle("hidden",sched);'''
app=replace_once(app,local_old,local_new,'local settings hides kpi')

# Wherever History and Settings are adjacent in page visibility checks, KPI belongs between them.
pattern=r'(!\$\("historyPage"\)\.classList\.contains\("hidden"\)\s*\|\|\s*)(!\$\("settingsPage"\)\.classList\.contains\("hidden"\))'
def add_kpi_visibility(m):
    return m.group(1)+'!$("kpiPage").classList.contains("hidden") ||\n         '+m.group(2)
app,count=re.subn(pattern,add_kpi_visibility,app)
if count<3:
    raise SystemExit(f'visibility checks: expected at least 3 matches, found {count}')

bindings='''  $("closeMobileMore").onclick=closeMobileMoreMenu;\n  $("mobileMoreModal").addEventListener("click",e=>{ if(e.target===$("mobileMoreModal")) closeMobileMoreMenu(); });\n  document.querySelectorAll("[data-mobile-more-tab]").forEach(b=>b.onclick=()=>openMobileMoreTab(b.dataset.mobileMoreTab));'''
new_bindings='''  if($("openKpiFromToday")) $("openKpiFromToday").onclick=()=>switchTab("kpi");\n  if($("openKpiFromHistory")) $("openKpiFromHistory").onclick=()=>switchTab("kpi");\n  if($("kpiBackBtn")) $("kpiBackBtn").onclick=()=>switchTab("adminToday");\n  if($("kpiRefreshBtn")) $("kpiRefreshBtn").onclick=loadKpi;\n  if($("kpiMonth")) $("kpiMonth").onchange=loadKpi;\n\n'''+bindings
app=replace_once(app,bindings,new_bindings,'kpi event bindings')
write('app.js',app)

# ---------- tests/run-tests.js ----------
tests=read('tests/run-tests.js')
tests=replace_once(tests,'loadModule("history.js");\nloadModule("safety.js");','loadModule("history.js");\nloadModule("kpi.js");\nloadModule("safety.js");','load kpi tests')

kpi_tests=r'''
// ---- Employee KPI ----
const kpiApi=window.MAKpi.create({
  expectedForDate:shifts.expectedForDate,
  serviceNames:()=>[settings.service1,settings.service2],
  getEmployeesForDate:key=>schedule.employeesForDate(dateObjectFromKey(key)),
  isNoManagerValue:schedule.isNoManagerValue,
  shiftStartForService:shifts.shiftStartForService,
  shiftEndForService:shifts.shiftEndForService,
  shiftMinutes:shifts.shiftMinutes,
  moscowParts:()=>({date:"2026-09-07",hour:22,minute:30}),
  escapeHtml:value=>String(value??"")
});

test("KPI: опоздание и пропуск уменьшают оценку по понятным правилам",()=>{
  const rows=[{
    service:"Моба",shift_date:"2026-09-07",opened_at:"2026-09-07T05:12:00.000Z",opened_by:"Арсен",
    open_late_minutes:12,closed_at:"2026-09-07T19:00:00.000Z",closed_by:"Арсен",early_close_minutes:0
  }];
  const result=kpiApi.calculate(rows,{from:"2026-09-07",to:"2026-09-07",now:{date:"2026-09-07",hour:22,minute:30}});
  const arsen=result.employees.find(x=>x.name==="Арсен");
  const asik=result.employees.find(x=>x.name==="Асик");
  assert(arsen);assert(asik);
  assert.strictEqual(arsen.total,1);
  assert.strictEqual(arsen.late,1);
  assert.strictEqual(arsen.score,95);
  assert.strictEqual(asik.missed,1);
  assert.strictEqual(asik.score,80);
});

test("KPI: аннулированная смена исключается и не портит сотруднику оценку",()=>{
  const rows=[{service:"Моба",shift_date:"2026-09-07",voided_at:"2026-09-07T10:00:00.000Z",opened_at:"2026-09-07T05:00:00.000Z",opened_by:"Арсен"}];
  const result=kpiApi.calculate(rows,{from:"2026-09-07",to:"2026-09-07",now:{date:"2026-09-07",hour:22,minute:30}});
  const arsen=result.employees.find(x=>x.name==="Арсен");
  assert(arsen);
  assert.strictEqual(arsen.total,0);
  assert.strictEqual(arsen.score,null);
});

test("KPI: мастер без ответственной смены получает «нет данных», а не штраф",()=>{
  const rows=[
    {service:"Моба",shift_date:"2026-09-07",opened_at:"2026-09-07T05:00:00.000Z",opened_by:"Арсен",open_late_minutes:0,closed_at:"2026-09-07T19:00:00.000Z",early_close_minutes:0},
    {service:"Нова",shift_date:"2026-09-07",opened_at:"2026-09-07T06:00:00.000Z",opened_by:"Асик",open_late_minutes:0,closed_at:"2026-09-07T16:00:00.000Z",early_close_minutes:0}
  ];
  const result=kpiApi.calculate(rows,{from:"2026-09-07",to:"2026-09-07",now:{date:"2026-09-07",hour:22,minute:30}});
  const oleg=result.employees.find(x=>x.name==="Олег");
  assert(oleg);
  assert.strictEqual(oleg.total,0);
  assert.strictEqual(oleg.score,null);
  assert.strictEqual(oleg.status.key,"nodata");
});

'''
project_marker='// ---- Project structure ----'
if project_marker not in tests: raise SystemExit('project structure marker not found')
tests=tests.replace(project_marker,kpi_tests+project_marker,1)

old_refs='const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","settings.js","devices.js","history.js","safety.js","app.js"];'
new_refs='const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","settings.js","devices.js","history.js","kpi.js","safety.js","app.js"];'
tests=replace_once(tests,old_refs,new_refs,'module order refs')
write('tests/run-tests.js',tests)

# ---------- permanent CI ----------
workflow=read('.github/workflows/ma-tests.yml')
workflow=replace_once(workflow,'          node --check history.js\n          node --check safety.js','          node --check history.js\n          node --check kpi.js\n          node --check safety.js','CI kpi syntax')
write('.github/workflows/ma-tests.yml',workflow)

print('KPI feature integration applied')
