from pathlib import Path

index_path=Path('index.html')
schedule_path=Path('schedule.js')
html=index_path.read_text(encoding='utf-8')
body=schedule_path.read_text(encoding='utf-8')

if 'window.MASchedule' in body:
    raise SystemExit('schedule.js already wrapped')
if 'function scheduleStartDate' not in body or 'function daySchedule' not in body:
    raise SystemExit('schedule.js does not contain expected schedule functions')

exports=[
'scheduleStartDate','globalDayIndex','mod','dateKeyFromDate','dateDiffDays',
'employeeCycleForDate','employeeWorksOnDate','employeesForDate','employeeServiceForDate',
'legacyTeamsForDate','legacyBaseScheduleForDate','standardBaseScheduleForDate','sameRoster',
'legacyMasterPlanBeforeRemoval','fixedMasterPlanForDate','balancedRosterState',
'isBalancedRosterRole','isNovaWeekendRule','isNoManagerValue','isNoMasterValue',
'baseScheduleForDate','daySchedule'
]

prefix='''(function(global){\n  "use strict";\n  global.MASchedule={\n    create(deps){\n      if(!deps || typeof deps.getSettings!=="function") throw new Error("MA Schedule: getSettings dependency is required");\n      const {anchorParts,monthInfo,serviceKeyForName,dateObjectFromKey,MASTER_ROSTER_FROM,MANAGER_ROSTER_FROM,REMOVED_MANAGER_NAME}=deps;\n      const settings=new Proxy({}, {\n        get(_target,prop){ return (deps.getSettings()||{})[prop]; },\n        set(_target,prop,value){ const s=deps.getSettings(); if(!s) return false; s[prop]=value; return true; },\n        ownKeys(){ return Reflect.ownKeys(deps.getSettings()||{}); },\n        getOwnPropertyDescriptor(){ return {enumerable:true,configurable:true}; }\n      });\n\n'''
suffix='''\n\n      return {\n''' + ',\n'.join('        '+x for x in exports) + '''\n      };\n    }\n  };\n})(window);\n'''
wrapped=prefix+body.rstrip('\n')+suffix
schedule_path.write_text(wrapped,encoding='utf-8')

marker='  // Schedule calculation logic moved to schedule.js\n\n'
if html.count(marker)!=1:
    raise SystemExit(f'Expected one schedule integration marker, found {html.count(marker)}')
installer='''  const {\n    scheduleStartDate,globalDayIndex,mod,dateKeyFromDate,dateDiffDays,\n    employeeCycleForDate,employeeWorksOnDate,employeesForDate,employeeServiceForDate,\n    legacyTeamsForDate,legacyBaseScheduleForDate,standardBaseScheduleForDate,sameRoster,\n    legacyMasterPlanBeforeRemoval,fixedMasterPlanForDate,balancedRosterState,\n    isBalancedRosterRole,isNovaWeekendRule,isNoManagerValue,isNoMasterValue,\n    baseScheduleForDate,daySchedule\n  }=window.MASchedule.create({\n    getSettings:()=>settings,\n    anchorParts,\n    monthInfo,\n    serviceKeyForName,\n    dateObjectFromKey,\n    MASTER_ROSTER_FROM,\n    MANAGER_ROSTER_FROM,\n    REMOVED_MANAGER_NAME\n  });\n\n'''
html=html.replace(marker,installer,1)
index_path.write_text(html,encoding='utf-8')

print('Wrapped schedule.js as MASchedule factory')
print('Injected schedule module inside app IIFE')
