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
'  function shiftMinutes(time){ const [h,m]=String(time||"00:00").split(":").map(Number); return h*60+m; }',
'''  function shiftMinutes(time){ const [h,m]=String(time||"00:00").split(":").map(Number); return h*60+m; }
  function shiftStartForService(service){
    return service===settings.service2 ? (settings.novaShiftStart||"09:00") : settings.shiftStart;
  }
  function shiftEndForService(service){
    return service===settings.service2 ? (settings.novaShiftEnd||"19:00") : settings.shiftEnd;
  }''',
'helpers')

once(
'    const service=currentDeviceAccess.device.service;\n    const expected=expectedForDate(now.date,service);',
'    const service=currentDeviceAccess.device.service;\n    const serviceStart=shiftStartForService(service);\n    const serviceEnd=shiftEndForService(service);\n    const expected=expectedForDate(now.date,service);',
'startup service times')

text=text.replace('${escapeHtml(settings.shiftStart)}–${escapeHtml(settings.shiftEnd)}','${escapeHtml(serviceStart)}–${escapeHtml(serviceEnd)}',2)
once('    const startM=shiftMinutes(settings.shiftStart);\n    const endM=shiftMinutes(settings.shiftEnd);','    const startM=shiftMinutes(serviceStart);\n    const endM=shiftMinutes(serviceEnd);','startup minute calc')

once(
'      const masterActsAsManager=!!(exp && service===settings.service2 && exp.manager===exp.master && !isNoMasterValue(exp.master));\n      const currentMins=now.hour*60+now.minute, startMins=shiftMinutes(settings.shiftStart), endMins=shiftMinutes(settings.shiftEnd);',
'      const masterActsAsManager=!!(exp && service===settings.service2 && exp.manager===exp.master && !isNoMasterValue(exp.master));\n      const serviceStart=shiftStartForService(service);\n      const serviceEnd=shiftEndForService(service);\n      const currentMins=now.hour*60+now.minute, startMins=shiftMinutes(serviceStart), endMins=shiftMinutes(serviceEnd);',
'today service times')
once('        meta=`Начало смены в ${settings.shiftStart}`;','        meta=`Начало смены в ${serviceStart}`;','today start label')
text=text.replace('${settings.shiftStart}–${settings.shiftEnd}','${serviceStart}–${serviceEnd}',3)

once(
'    const nowM=now.hour*60+now.minute;\n    const startM=shiftMinutes(settings.shiftStart);\n    const endM=shiftMinutes(settings.shiftEnd);\n    const problems=[];',
'    const nowM=now.hour*60+now.minute;\n    const problems=[];',
'attention globals')
once(
'      const exp=expectedForDate(now.date,service);\n\n      if(exp && isNoManagerValue(exp.manager)) continue;',
'      const exp=expectedForDate(now.date,service);\n      const serviceStart=shiftStartForService(service);\n      const serviceEnd=shiftEndForService(service);\n      const startM=shiftMinutes(serviceStart);\n      const endM=shiftMinutes(serviceEnd);\n\n      if(exp && isNoManagerValue(exp.manager)) continue;',
'attention service times')
once('        problems.push({kind:"bad",text:`${service}: смена не открыта после ${settings.shiftStart}.`});','        problems.push({kind:"bad",text:`${service}: смена не открыта после ${serviceStart}.`});','attention start label')
once('        problems.push({kind:"bad",text:`${service}: смена не закрыта после ${settings.shiftEnd}.`});','        problems.push({kind:"bad",text:`${service}: смена не закрыта после ${serviceEnd}.`});','attention end label')

once(
'    const currentMins=now.hour*60+now.minute, startMins=shiftMinutes(settings.shiftStart);',
'    const serviceStart=shiftStartForService(service);\n    const currentMins=now.hour*60+now.minute, startMins=shiftMinutes(serviceStart);',
'employee service start')
once('      meta=`Начало в ${settings.shiftStart}`;','      meta=`Начало в ${serviceStart}`;','employee service label')

once('        shiftText=`Смена начинается в ${settings.shiftStart}`;','        shiftText=`Смена начинается в ${shiftStartForService(todayAssignment.service)}`;','employee today start')
once('<strong>${escapeHtml(todayAssignment.service)}</strong> · ${settings.shiftStart}–${settings.shiftEnd}','<strong>${escapeHtml(todayAssignment.service)}</strong> · ${shiftStartForService(todayAssignment.service)}–${shiftEndForService(todayAssignment.service)}','employee today hours')
once('${escapeHtml(x.service)} · ${settings.shiftStart}–${settings.shiftEnd}','${escapeHtml(x.service)} · ${shiftStartForService(x.service)}–${shiftEndForService(x.service)}','employee list hours')
once('${escapeHtml(assignment.service)} · ${settings.shiftStart}–${settings.shiftEnd}','${escapeHtml(assignment.service)} · ${shiftStartForService(assignment.service)}–${shiftEndForService(assignment.service)}','employee calendar hours')

text=text.replace('<div class="current-schedule-row"><b>На смене:</b> 1 менеджер + 1 мастер</div>','<div class="current-schedule-row"><b>На смене:</b> 1 менеджер + 1 мастер · 08:00–22:00</div>',1)
text=text.replace('<div class="current-schedule-row"><b>Смена:</b> мастер открывает и закрывает её своим PIN</div>','<div class="current-schedule-row"><b>Смена:</b> 09:00–19:00 · мастер открывает и закрывает её своим PIN</div>',1)

p.write_text(text,encoding='utf-8')
print('nova-hours-patched')