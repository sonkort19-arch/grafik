from pathlib import Path

p = Path("index.html")
text = p.read_text(encoding="utf-8")


def once(old, new, label):
    global text
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected 1 match, found {n}")
    text = text.replace(old, new, 1)


once(
    '  const MASTER_ROSTER_FROM = "2026-08-24";\n  const MASTER_TEMP_TO = "2026-08-31";\n  const REMOVED_MASTER_NAME = "Ислам";',
    '  const MASTER_ROSTER_FROM = "2026-08-24";\n  const MASTER_TEMP_TO = "2026-08-31";\n  const MANAGER_ROSTER_FROM = "2026-09-07";\n  const REMOVED_MASTER_NAME = "Ислам";\n  const REMOVED_MANAGER_NAME = "Сергей";',
    "constants"
)

once(
    '    });\n\n    return list;\n  }\n\n  function employeeServiceForDate',
    '    });\n\n    // С 07.09.2026 Сергей не участвует в действующем и будущем графике.\n    // История до этой даты остаётся без изменений.\n    if(key>=MANAGER_ROSTER_FROM){\n      list.forEach(emp=>{\n        if(emp.role==="manager" && emp.name===REMOVED_MANAGER_NAME) emp.inactive=true;\n      });\n    }\n\n    return list;\n  }\n\n  function employeeServiceForDate',
    "remove Sergey"
)

once(
    '  function activeManagerNames(dateStr=moscowParts().date){\n    return [...new Set(activeEmployeesForDate(dateStr).filter(x=>x.role==="manager").map(x=>x.name).filter(Boolean))];\n  }',
    '  function activeManagerNames(dateStr=moscowParts().date){\n    const active=activeEmployeesForDate(dateStr);\n    const names=active.filter(x=>x.role==="manager").map(x=>x.name).filter(Boolean);\n    if(dateStr>=MANAGER_ROSTER_FROM){\n      active.filter(x=>x.role==="master").forEach(x=>{ if(x.name) names.push(x.name); });\n    }\n    return [...new Set(names)];\n  }',
    "responsible names"
)

once(
    '    const names=new Set((settings.employeeSchedules||[]).filter(x=>x.role==="manager").map(x=>x.name));',
    '    const names=new Set((settings.employeeSchedules||[]).filter(x=>x.role==="manager" || x.role==="master").map(x=>x.name));',
    "history responsible names"
)

once(
    '    const managerReady=sameRoster(managers,["Сергей","Арсен","Дина"]);',
    '    const managerReady=key<MANAGER_ROSTER_FROM\n      ? sameRoster(managers,["Сергей","Арсен","Дина"])\n      : sameRoster(managers,["Арсен","Дина"]);',
    "managerReady"
)

old = '''    if(managerReady){
      const mobaPhase=mod(days,4);
      const mobaRegularManager=(mobaPhase===0 || mobaPhase===1) ? "Арсен" : "Дина";

      const weekday=date.getDay();
      const swapDay=(weekday===2 || weekday===4); // вторник / четверг

      if(swapDay){
        // Сергей идёт в Мобу, а Арсен/Дина по своему 2/2 в этот день идут в Нову.
        managerS1="Сергей";
        managerS2=mobaRegularManager;
      }else{
        managerS1=mobaRegularManager;
        managerS2=(weekday>=1 && weekday<=5) ? "Сергей" : "Без менеджера";
      }

      managerOff=["Арсен","Дина","Сергей"].filter(name=>name!==managerS1 && name!==managerS2);
    }'''

new = '''    if(managerReady){
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
    }'''

once(old, new, "manager schedule")

once(
    '    if(masterReady){\n      const masterDay=fixedMasterPlanForDate(date);\n      masterS1=masterDay.s1;\n      masterS2=masterDay.s2;\n      masterOff=["Олег","Георгий","Асик"].filter(n=>n!==masterS1 && n!==masterS2);\n      masterTeamS1=["Олег","Георгий","Асик"];\n      masterTeamS2=["Георгий","Асик"];\n    }\n\n    return {',
    '    if(masterReady){\n      const masterDay=fixedMasterPlanForDate(date);\n      masterS1=masterDay.s1;\n      masterS2=masterDay.s2;\n      masterOff=["Олег","Георгий","Асик"].filter(n=>n!==masterS1 && n!==masterS2);\n      masterTeamS1=["Олег","Георгий","Асик"];\n      masterTeamS2=["Георгий","Асик"];\n    }\n\n    if(managerReady && masterReady && key>=MANAGER_ROSTER_FROM){\n      managerS2=masterS2;\n    }\n\n    return {',
    "master as Nova manager"
)

once(
    '        fixedS2:"Сергей",',
    '        fixedS2:key>=MANAGER_ROSTER_FROM?"Мастер Новы":"Сергей",',
    "fixedS2"
)

once(
    '    if(isNovaWeekendRule(date,settings.service2)){',
    '    if(key<MANAGER_ROSTER_FROM && isNovaWeekendRule(date,settings.service2)){',
    "weekend rule"
)

old_cards = '''      <div class="current-schedule-card service-s1">
        <h3>${escapeHtml(settings.service1)}</h3>
        <div class="current-schedule-row"><b>Менеджеры:</b> Арсен / Дина — 2/2</div>
        <div class="current-schedule-row"><b>Вт и Чт:</b> Сергей работает здесь, Арсен/Дина переходят в ${escapeHtml(settings.service2)}</div>
        <div class="current-schedule-row"><b>Мастер:</b> Олег — Пн–Пт</div>
        <div class="current-schedule-row"><b>Сб и Вс:</b> Георгий / Асик работают по очереди неделями</div>
      </div>

      <div class="current-schedule-card service-s2">
        <h3>${escapeHtml(settings.service2)}</h3>
        <div class="current-schedule-row"><b>Менеджер:</b> Сергей — Пн / Ср / Пт</div>
        <div class="current-schedule-row"><b>Вт и Чт:</b> работает Арсен или Дина по своему 2/2</div>
        <div class="current-schedule-row"><b>Сб и Вс:</b> без менеджера</div>
        <div class="current-schedule-row"><b>Мастера:</b> Георгий / Асик — по двухнедельному циклу</div>
      </div>'''

new_cards = '''      <div class="current-schedule-card service-s1">
        <h3>${escapeHtml(settings.service1)}</h3>
        <div class="current-schedule-row"><b>Менеджеры:</b> Арсен / Дина — 2/2, только в этой точке</div>
        <div class="current-schedule-row"><b>Мастер:</b> Олег — Пн–Пт</div>
        <div class="current-schedule-row"><b>Сб и Вс:</b> Георгий / Асик работают по очереди неделями</div>
        <div class="current-schedule-row"><b>На смене:</b> 1 менеджер + 1 мастер</div>
      </div>

      <div class="current-schedule-card service-s2">
        <h3>${escapeHtml(settings.service2)}</h3>
        <div class="current-schedule-row"><b>Отдельного менеджера нет.</b></div>
        <div class="current-schedule-row"><b>Мастер:</b> Георгий / Асик — по действующему двухнедельному циклу</div>
        <div class="current-schedule-row"><b>Ответственный:</b> мастер Новы одновременно выполняет функцию менеджера</div>
        <div class="current-schedule-row"><b>Смена:</b> мастер открывает и закрывает её своим PIN</div>
      </div>'''

once(old_cards, new_cards, "schedule cards")

old_solo = '      const solo=isNoManagerValue(partner);'
count = text.count(old_solo)
if count < 3:
    raise SystemExit(f"solo detection: expected >=3, found {count}")
text = text.replace(old_solo, '      const solo=isNoManagerValue(partner) || partner===name;')

text = text.replace(
    '${solo?"Работаю один, без менеджера":`Напарник: <strong>${escapeHtml(partner)}</strong>`}',
    '${partner===name?"Работаю один · отвечаю за точку и смену":solo?"Работаю один, без менеджера":`Напарник: <strong>${escapeHtml(partner)}</strong>`}'
)
text = text.replace(
    '${solo?"Работаю один, без менеджера":`Вместе с ${escapeHtml(partner)}`}',
    '${partner===name?"Работаю один · отвечаю за точку и смену":solo?"Работаю один, без менеджера":`Вместе с ${escapeHtml(partner)}`}'
)
text = text.replace(
    '${solo?"Работаю один, без менеджера":`Напарник: ${escapeHtml(partner)}`}',
    '${partner===name?"Работаю один · отвечаю за точку и смену":solo?"Работаю один, без менеджера":`Напарник: ${escapeHtml(partner)}`}'
)

once(
    '    if(isNoManagerValue(pair.manager)) return `Только ${pair.master}`;',
    '    if(pair.manager===pair.master && !isNoMasterValue(pair.master)) return `Только ${pair.master} · отвечает за точку`;\n    if(isNoManagerValue(pair.manager)) return `Только ${pair.master}`;',
    "calendar pair"
)

once(
    '      const soloMaster=!!(exp && isNoManagerValue(exp.manager));',
    '      const soloMaster=!!(exp && isNoManagerValue(exp.manager));\n      const masterActsAsManager=!!(exp && service===settings.service2 && exp.manager===exp.master && !isNoMasterValue(exp.master));',
    "today flag"
)

once(
    '      }else if(currentMins>=startMins){\n        cls="missing"; label="Смена не открыта"; meta="Подтверждения от менеджера ещё нет";',
    '      }else if(currentMins>=startMins){\n        cls="missing"; label="Смена не открыта"; meta=masterActsAsManager?"Подтверждения от ответственного мастера ещё нет":"Подтверждения от менеджера ещё нет";',
    "today missing"
)

once(
    '      const pairText=exp\n        ? (soloMaster\n          ? `Только мастер: <strong>${escapeHtml(exp.master)}</strong><br>Без менеджера<br>${settings.shiftStart}–${settings.shiftEnd}`\n          : `Менеджер: <strong>${escapeHtml(exp.manager)}</strong><br>Мастер: <strong>${escapeHtml(exp.master)}</strong><br>${settings.shiftStart}–${settings.shiftEnd}`)',
    '      const pairText=exp\n        ? (masterActsAsManager\n          ? `Мастер: <strong>${escapeHtml(exp.master)}</strong><br>Отвечает за точку и открывает смену<br>${settings.shiftStart}–${settings.shiftEnd}`\n          : soloMaster\n            ? `Только мастер: <strong>${escapeHtml(exp.master)}</strong><br>Без менеджера<br>${settings.shiftStart}–${settings.shiftEnd}`\n            : `Менеджер: <strong>${escapeHtml(exp.manager)}</strong><br>Мастер: <strong>${escapeHtml(exp.master)}</strong><br>${settings.shiftStart}–${settings.shiftEnd}`)',
    "today pair"
)

text = text.replace(
    '      ? "Сергей обычно здесь · вт/чт Арсен/Дина"\n      : "Арсен/Дина 2/2 · вт/чт Сергей";',
    '      ? "Мастер Новы = ответственный за смену"\n      : "Арсен/Дина 2/2 · только Моба";'
)

text = text.replace("Дисциплина менеджеров", "Дисциплина ответственных")
text = text.replace('<option value="">Все менеджеры</option>', '<option value="">Все ответственные</option>')

p.write_text(text, encoding="utf-8")
print("patch-ok")
