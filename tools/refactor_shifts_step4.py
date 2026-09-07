from pathlib import Path
import re

index_path=Path('index.html')
shifts_path=Path('shifts.js')
html=index_path.read_text(encoding='utf-8')

if shifts_path.exists():
    raise SystemExit('shifts.js already exists; refusing to overwrite')
if '<script src="schedule.js"></script>' not in html:
    raise SystemExit('schedule.js script tag not found')
if 'window.MAShifts.create' in html:
    raise SystemExit('MA Shifts module already initialized')

start=html.find('  function expectedForDate(')
end=html.find('  function isStartupShiftMode()', start)
if start<0 or end<0 or end<=start:
    raise SystemExit('Could not locate shift core block')
old_block=html[start:end]
required=['function expectedForDate(','function shiftMinutes(','function shiftStartForService(','function shiftEndForService(']
for item in required:
    if item not in old_block:
        raise SystemExit(f'Missing required shift function: {item}')

module_init='''  const {\n    expectedForDate,\n    shiftMinutes,\n    shiftStartForService,\n    shiftEndForService,\n    isValidShiftPin\n  }=window.MAShifts.create({\n    getSettings:()=>settings,\n    monthIndexForYearMonth,\n    getDaySchedule:()=>daySchedule\n  });\n\n'''
new_html=html[:start]+module_init+html[end:]
new_html=new_html.replace('<script src="schedule.js"></script>','<script src="schedule.js"></script>\n<script src="shifts.js"></script>',1)

# Route all PIN validation through the shifts module.
count_simple=new_html.count('!/^\\d{4}$/.test(pin)')
if count_simple != 2:
    raise SystemExit(f'Expected 2 direct PIN checks, found {count_simple}')
new_html=new_html.replace('!/^\\d{4}$/.test(pin)','!isValidShiftPin(pin)')

old_invalid='const invalid=updates.find(x=>!/^[0-9]{4}$/.test(x.pin));'
if new_html.count(old_invalid)!=1:
    raise SystemExit('Manager PIN validation line not found exactly once')
new_html=new_html.replace(old_invalid,'const invalid=updates.find(x=>!isValidShiftPin(x.pin));',1)

module=r'''(function(global){
  "use strict";

  global.MAShifts={
    create(deps){
      if(!deps || typeof deps.getSettings!=="function") throw new Error("MA Shifts: getSettings dependency is required");
      if(typeof deps.monthIndexForYearMonth!=="function") throw new Error("MA Shifts: monthIndexForYearMonth dependency is required");
      if(typeof deps.getDaySchedule!=="function") throw new Error("MA Shifts: getDaySchedule dependency is required");

      function settings(){ return deps.getSettings()||{}; }

      function expectedForDate(dateStr,serviceName){
        try{
          const [y,m,d]=String(dateStr||"").split("-").map(Number);
          if(y<2020 || y>2100 || m<1 || m>12 || d<1 || d>31) return null;
          const idx=deps.monthIndexForYearMonth(y,m-1);
          const daySchedule=deps.getDaySchedule();
          if(typeof daySchedule!=="function") return null;
          const row=daySchedule(idx,d);
          const s=settings();
          const pair=serviceName===s.service1 ? row?.s1 : serviceName===s.service2 ? row?.s2 : null;
          return pair ? {manager:pair.manager,master:pair.master} : null;
        }catch(e){
          return null;
        }
      }

      function shiftMinutes(time){
        const [h,m]=String(time||"00:00").split(":").map(Number);
        return (Number.isFinite(h)?h:0)*60 + (Number.isFinite(m)?m:0);
      }

      function shiftStartForService(service){
        const s=settings();
        return service===s.service2 ? (s.novaShiftStart||"09:00") : (s.shiftStart||"08:00");
      }

      function shiftEndForService(service){
        const s=settings();
        return service===s.service2 ? (s.novaShiftEnd||"19:00") : (s.shiftEnd||"22:00");
      }

      function isValidShiftPin(pin){
        return /^\d{4}$/.test(String(pin||""));
      }

      return {
        expectedForDate,
        shiftMinutes,
        shiftStartForService,
        shiftEndForService,
        isValidShiftPin
      };
    }
  };
})(window);
'''

# Safety checks: only the core block, module tag and PIN validation wiring should change.
if 'function expectedForDate(' in new_html or 'function shiftStartForService(' in new_html:
    raise SystemExit('Old shift core functions still remain in index.html')
if new_html.count('src="shifts.js"')!=1:
    raise SystemExit('shifts.js must be referenced exactly once')
if new_html.count('isValidShiftPin(')<3:
    raise SystemExit('PIN validation was not fully routed through module')

shifts_path.write_text(module,encoding='utf-8')
index_path.write_text(new_html,encoding='utf-8')

print('Step 4 core extracted')
print('Old shift block chars:',len(old_block))
print('PIN checks moved:',count_simple+1)
