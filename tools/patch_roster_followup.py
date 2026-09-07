from pathlib import Path

p=Path('index.html')
text=p.read_text(encoding='utf-8')

def once(old,new,label):
    global text
    n=text.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1, found {n}')
    text=text.replace(old,new,1)

once(
    '      active.filter(x=>x.role==="master").forEach(x=>{ if(x.name) names.push(x.name); });',
    '      active.filter(x=>x.role==="master" && ["Георгий","Асик"].includes(x.name)).forEach(x=>{ if(x.name) names.push(x.name); });',
    'responsible masters'
)

once(
    '  function startupManagerOptions(expectedManager){\n    const names=activeManagerNames();',
    '  function startupManagerOptions(expectedManager){\n    const names=(expectedManager && moscowParts().date>=MANAGER_ROSTER_FROM) ? [expectedManager] : activeManagerNames();',
    'startup options'
)

once(
    '    const names=activeManagerNames();\n    $("shiftEmployee").innerHTML=names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");',
    '    const names=(expected && expected.manager && moscowParts().date>=MANAGER_ROSTER_FROM) ? [expected.manager] : activeManagerNames();\n    $("shiftEmployee").innerHTML=names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");',
    'shift options'
)

once(
    '    $("shiftActionInfo").innerHTML=expected?`По графику сегодня: <b>${escapeHtml(expected.manager)} + ${escapeHtml(expected.master)}</b>`:"На эту дату автоматический график не найден. Смену можно подтвердить вручную.";',
    '    $("shiftActionInfo").innerHTML=expected\n      ? (service===settings.service2 && expected.manager===expected.master\n        ? `По графику сегодня отвечает: <b>${escapeHtml(expected.master)}</b>`\n        : `По графику сегодня: <b>${escapeHtml(expected.manager)} + ${escapeHtml(expected.master)}</b>`)\n      : "На эту дату автоматический график не найден. Смену можно подтвердить вручную.";',
    'shift info'
)

once(
    '    root.innerHTML=activeManagerNames().map((n,i)=>`<div class="pin-grid"><div class="field" style="margin:0"><label>${escapeHtml(n)}</label><input class="readonly" value="Менеджер" readonly></div><div class="field" style="margin:0"><label>Новый PIN</label><input id="managerPin${i}" type="password" inputmode="numeric" maxlength="4" placeholder="4 цифры"></div></div>`).join("");',
    '    root.innerHTML=activeManagerNames().map((n,i)=>`<div class="pin-grid"><div class="field" style="margin:0"><label>${escapeHtml(n)}</label><input class="readonly" value="${["Георгий","Асик"].includes(n)?"Мастер Новы / ответственный":"Менеджер"}" readonly></div><div class="field" style="margin:0"><label>Новый PIN</label><input id="managerPin${i}" type="password" inputmode="numeric" maxlength="4" placeholder="4 цифры"></div></div>`).join("");',
    'pin labels'
)

text=text.replace('Дисциплина менеджеров','Дисциплина ответственных')
p.write_text(text,encoding='utf-8')
print('followup-ok')
