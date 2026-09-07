from pathlib import Path
import re


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old,new,1)


def function_bounds(text,name):
    m=re.search(r'(?m)^\s*(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(',text)
    if not m:
        raise SystemExit(f'function not found: {name}')
    i=text.find('{',m.end())
    if i<0: raise SystemExit(f'opening brace not found: {name}')
    depth=0; state='code'; quote=''; esc=False
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ''
        if state=='code':
            if c in "'\"`": state='str'; quote=c; esc=False
            elif c=='/' and n=='/': state='line'; i+=1
            elif c=='/' and n=='*': state='block'; i+=1
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0: return m.start(),i+1
        elif state=='str':
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: state='code'
        elif state=='line':
            if c=='\n': state='code'
        elif state=='block':
            if c=='*' and n=='/': state='code'; i+=1
        i+=1
    raise SystemExit(f'unclosed function: {name}')

# ----- app.js -----
p=Path('app.js')
app=p.read_text(encoding='utf-8')
app=replace_once(app,
'  const TODAY_SHIFT_CACHE_KEY = "ma_today_shift_cache_v1";\n',
'  const TODAY_SHIFT_CACHE_KEY = "ma_today_shift_cache_v1";\n  const ERROR_LOG_KEY = "ma_error_log_v1";\n',
'error storage key')

anchor='  const employeeFilter = $("employeeFilter");\n'
logger=r'''

  const errorJournal=(window.MAErrors && typeof window.MAErrors.create==="function")
    ? window.MAErrors.create({
        storageKey:ERROR_LOG_KEY,
        maxEntries:50,
        getContext:()=>({
          path:String(location.pathname||"/"),
          online:navigator.onLine!==false,
          mode:isAdmin()?"admin":(isServiceDeviceMode()?"service":"employee"),
          service:serviceDeviceName()||"",
          viewport:`${window.innerWidth||0}x${window.innerHeight||0}`
        })
      })
    : null;

  function appErrorEntries(){
    try{ return errorJournal?.list?.() || []; }catch(_){ return []; }
  }

  function logAppError(scope,error,meta={}){
    try{ console.error(`[MA График · ${scope}]`,error,meta); }catch(_){ }
    let entry=null;
    try{ entry=errorJournal?.log?.(scope,error,meta) || null; }catch(_){ }
    try{
      const page=$("settingsPage");
      if(page && !page.classList.contains("hidden")){
        renderErrorLog();
        updateSettingsSystemStatus();
      }
    }catch(_){ }
    return entry;
  }

  function errorTimeLabel(value){
    const ms=Date.parse(value||"");
    if(!ms) return "—";
    try{
      return new Intl.DateTimeFormat("ru-RU",{
        timeZone:SHIFT_TIMEZONE,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
      }).format(new Date(ms));
    }catch(_){ return String(value||"—"); }
  }

  function renderErrorLog(){
    const root=$("errorLogList");
    if(!root) return;
    const entries=appErrorEntries();
    const badge=$("errorLogCountBadge");
    if(badge) badge.textContent=entries.length ? `(${entries.length})` : "";
    if(!entries.length){
      root.innerHTML='<div class="error-log-empty">Ошибок не зафиксировано.</div>';
      return;
    }
    root.innerHTML=entries.slice(0,20).map(entry=>{
      const repeat=Number(entry.count||1)>1 ? ` · ×${Number(entry.count)}` : "";
      const scope=escapeHtml(entry.scope||"error");
      const message=escapeHtml(entry.message||"Неизвестная ошибка");
      return `<div class="error-log-item">
        <div class="error-log-head"><b>${scope}</b><span>${escapeHtml(errorTimeLabel(entry.lastAt||entry.at))}${repeat}</span></div>
        <div class="error-log-message">${message}</div>
      </div>`;
    }).join("");
  }

  async function copyErrorLog(){
    const text=errorJournal?.formatText?.() || "MA График — журнал ошибок недоступен.";
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
      }else{
        const area=document.createElement("textarea");
        area.value=text; area.setAttribute("readonly","");
        area.style.position="fixed"; area.style.opacity="0";
        document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      toast("Журнал ошибок скопирован");
    }catch(e){
      logAppError("error log copy",e);
      toast("Не удалось скопировать журнал");
    }
  }

  function clearErrorLog(){
    try{ errorJournal?.clear?.(); }catch(_){ }
    renderErrorLog();
    updateSettingsSystemStatus();
    toast("Журнал ошибок очищен");
  }

  const copyErrorLogBtn=$("copyErrorLogBtn");
  if(copyErrorLogBtn) copyErrorLogBtn.onclick=copyErrorLog;
  const clearErrorLogBtn=$("clearErrorLogBtn");
  if(clearErrorLogBtn) clearErrorLogBtn.onclick=clearErrorLog;

  window.addEventListener("error",event=>{
    try{
      if(event.target && event.target!==window){
        const target=event.target;
        const resource=String(target.src||target.href||"").split("?")[0];
        logAppError("resource load",new Error("Не удалось загрузить ресурс"),{
          tag:String(target.tagName||"resource"),resource
        });
        return;
      }
      logAppError("window error",event.error||new Error(event.message||"Необработанная ошибка"),{
        file:String(event.filename||"").split("?")[0],line:event.lineno||0,column:event.colno||0
      });
    }catch(_){ }
  },true);

  window.addEventListener("unhandledrejection",event=>{
    try{ logAppError("unhandled promise",event.reason||new Error("Необработанная ошибка Promise")); }catch(_){ }
  });
'''
app=replace_once(app,anchor,anchor+logger,'logger insertion')

# Add error health status before updateSettingsSystemStatus closes.
start,end=function_bounds(app,'updateSettingsSystemStatus')
fn=app[start:end]
insert=r'''

    const errorEntries=appErrorEntries();
    if(!errorEntries.length){
      setSystemHealth("systemErrorsIcon","systemErrorsText","ok","Ошибок не зафиксировано");
    }else{
      const latest=errorEntries[0];
      setSystemHealth(
        "systemErrorsIcon","systemErrorsText","warn",
        `${errorEntries.length} записей · последняя ${errorTimeLabel(latest.lastAt||latest.at)}`
      );
    }
'''
fn=fn[:-1]+insert+'  }'
app=app[:start]+fn+app[end:]

# Settings render must include journal.
start,end=function_bounds(app,'populateSettings')
fn=app[start:end]
fn=replace_once(fn,'    renderDevicePanel();\n    updateSettingsSystemStatus();\n','    renderDevicePanel();\n    renderErrorLog();\n    updateSettingsSystemStatus();\n','populate error log')
app=app[:start]+fn+app[end:]

# Important caught errors should also enter the journal.
start,end=function_bounds(app,'loadTodayShifts')
fn=app[start:end]
fn=replace_once(fn,'        console.error(e);\n        if(showToast) toast("Не удалось обновить смены");','        logAppError("today shifts load",e);\n        if(showToast) toast("Не удалось обновить смены");','today shifts logger')
app=app[:start]+fn+app[end:]

app=replace_once(app,
'  initApp().catch(e=>{\n    console.error("init",e);\n',
'  initApp().catch(e=>{\n    logAppError("init",e);\n',
'init logger')

p.write_text(app,encoding='utf-8')

# ----- index.html -----
p=Path('index.html')
html=p.read_text(encoding='utf-8')
health_anchor='''          <div class="system-health-row">\n            <span class="system-health-icon" id="systemS2Icon">•</span>\n            <div><b id="systemS2Name">Нова</b><small id="systemS2Text">Проверяем устройство…</small></div>\n          </div>\n'''
health_new=health_anchor+'''          <div class="system-health-row">\n            <span class="system-health-icon" id="systemErrorsIcon">•</span>\n            <div><b>Ошибки</b><small id="systemErrorsText">Проверяем журнал…</small></div>\n          </div>\n'''
html=replace_once(html,health_anchor,health_new,'system error health row')

push_details='''        <details class="settings-inline-details">\n          <summary>Уведомления владельцу</summary>\n          <div class="push-box" style="margin-top:10px">\n            <div class="push-state" id="pushState">Проверяем поддержку уведомлений…</div>\n            <button class="primary" id="enablePushBtn">Включить уведомления</button>\n          </div>\n        </details>\n'''
error_details=push_details+'''\n        <details class="settings-inline-details" id="errorLogDetails">\n          <summary>Журнал ошибок <span id="errorLogCountBadge"></span></summary>\n          <div class="error-log-box">\n            <div class="error-log-list" id="errorLogList"><div class="error-log-empty">Проверяем журнал…</div></div>\n            <div class="error-log-actions">\n              <button class="secondary" id="copyErrorLogBtn" type="button">Скопировать журнал</button>\n              <button class="secondary" id="clearErrorLogBtn" type="button">Очистить</button>\n            </div>\n          </div>\n        </details>\n'''
html=replace_once(html,push_details,error_details,'error journal UI')
html=replace_once(html,'<script src="admin.js"></script>\n<script src="app.js"></script>','<script src="admin.js"></script>\n<script src="errors.js"></script>\n<script src="app.js"></script>','errors script tag')
p.write_text(html,encoding='utf-8')

# ----- styles.css -----
p=Path('styles.css')
css=p.read_text(encoding='utf-8')
styles=r'''

/* Stage 3: local error journal */
.error-log-box{margin-top:10px}
.error-log-list{display:grid;gap:8px;max-height:300px;overflow:auto;padding-right:2px}
.error-log-empty{padding:10px 0;color:var(--muted);font-size:14px}
.error-log-item{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:10px}
.error-log-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;font-size:13px}
.error-log-head b{overflow-wrap:anywhere}
.error-log-head span{color:var(--muted);white-space:nowrap}
.error-log-message{margin-top:6px;font-size:13px;line-height:1.35;overflow-wrap:anywhere}
.error-log-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
#errorLogCountBadge{color:var(--muted);font-weight:700}
'''
if '/* Stage 3: local error journal */' in css:
    raise SystemExit('error styles already present')
css=css.rstrip()+styles+'\n'
p.write_text(css,encoding='utf-8')

# ----- tests/run-tests.js -----
p=Path('tests/run-tests.js')
tests=p.read_text(encoding='utf-8')
tests=replace_once(tests,'loadModule("supabase.js");\n','loadModule("supabase.js");\nloadModule("errors.js");\n','load errors module')
marker='// ---- Project structure ----\n'
error_tests=r'''// ---- Error journal ----
let errorNow=Date.parse("2026-09-07T12:00:00.000Z");
const errorApi=window.MAErrors.create({
  storageKey:"test_errors",
  maxEntries:20,
  now:()=>new Date(errorNow),
  getContext:()=>({screen:"test",token:"context-secret"})
});

test("Журнал ошибок сохраняет ошибку и скрывает секретные данные",()=>{
  errorApi.clear();
  errorApi.log("sync",new Error("boom"),{token:"supersecret",pin:"1234",safe:"ok"});
  const rows=errorApi.list();
  assert.strictEqual(rows.length,1);
  assert.strictEqual(rows[0].scope,"sync");
  assert.strictEqual(rows[0].message,"boom");
  assert.strictEqual(rows[0].meta.token,"[REDACTED]");
  assert.strictEqual(rows[0].meta.pin,"[REDACTED]");
  assert.strictEqual(rows[0].meta.safe,"ok");
  assert.strictEqual(rows[0].context.token,"[REDACTED]");
  const text=errorApi.formatText();
  assert(!text.includes("supersecret"));
  assert(!text.includes("1234"));
});

test("Одинаковые ошибки подряд объединяются, а не засоряют журнал",()=>{
  errorApi.clear();
  errorNow=Date.parse("2026-09-07T12:00:00.000Z");
  errorApi.log("network",new Error("offline"));
  errorNow+=1000;
  errorApi.log("network",new Error("offline"));
  const rows=errorApi.list();
  assert.strictEqual(rows.length,1);
  assert.strictEqual(rows[0].count,2);
});

'''
tests=replace_once(tests,marker,error_tests+marker,'error tests')
tests=replace_once(tests,'  const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","app.js"];','  const refs=["schedule.js","shifts.js","employees.js","supabase.js","wallets.js","admin.js","errors.js","app.js"];','module order test')
p.write_text(tests,encoding='utf-8')

# ----- permanent workflow -----
p=Path('.github/workflows/ma-tests.yml')
yml=p.read_text(encoding='utf-8')
yml=replace_once(yml,'          node --check admin.js\n          node --check app.js\n','          node --check admin.js\n          node --check errors.js\n          node --check app.js\n','check errors syntax')
p.write_text(yml,encoding='utf-8')

print('Stage 3 error journal patch applied')
