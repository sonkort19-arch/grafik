from pathlib import Path

p=Path('app.js')
text=p.read_text(encoding='utf-8')
original=text

def replace_once(old,new,label):
    global text
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    text=text.replace(old,new,1)

replace_once(
'''  let lastShiftSignature = "";\n  let lastSettingsSignature = "";\n''',
'''  let lastShiftSignature = "";\n  let lastSettingsSignature = "";\n  let lastAttentionSignature = "";\n''',
'attention state'
)

replace_once(
'''  function buildMonthRows(monthIndex){\n    const info=monthInfo(monthIndex), rows=[];\n    for(let d=1;d<=info.days;d++) rows.push(daySchedule(monthIndex,d));\n    return rows;\n  }\n''',
'''  let monthRowsCacheSignature="";\n  const monthRowsCache=new Map();\n  function buildMonthRows(monthIndex){\n    const settingsSignature=stableJson(settings);\n    if(settingsSignature!==monthRowsCacheSignature){\n      monthRowsCache.clear();\n      monthRowsCacheSignature=settingsSignature;\n    }\n    if(monthRowsCache.has(monthIndex)) return monthRowsCache.get(monthIndex);\n\n    const info=monthInfo(monthIndex), rows=[];\n    for(let d=1;d<=info.days;d++) rows.push(daySchedule(monthIndex,d));\n    monthRowsCache.set(monthIndex,rows);\n    if(monthRowsCache.size>24){\n      const oldestKey=monthRowsCache.keys().next().value;\n      monthRowsCache.delete(oldestKey);\n    }\n    return rows;\n  }\n''',
'month rows cache'
)

replace_once(
'''    const box=$("attentionBox");\n    if(problems.length){\n''',
'''    const attentionSignature=`${isServiceDeviceMode()?serviceDeviceName():"all"}|${stableJson(problems)}`;\n    if(attentionSignature===lastAttentionSignature) return;\n    lastAttentionSignature=attentionSignature;\n\n    const box=$("attentionBox");\n    if(problems.length){\n''',
'attention render cache'
)

replace_once(
'''          if(!$("adminTodayPage").classList.contains("hidden")) renderTodayShifts();\n          if(isEmployeePhoneMode() && employeeMobileView==="employeeToday") renderEmployeePages();\n          renderAdminAttention();\n''',
'''          const todayVisible=!$("adminTodayPage").classList.contains("hidden");\n          if(todayVisible) renderTodayShifts();\n          if(isEmployeePhoneMode() && employeeMobileView==="employeeToday") renderEmployeePages();\n          if(!todayVisible) renderAdminAttention();\n''',
'shift attention duplicate'
)

replace_once(
'''    if(adminToday){\n      renderTodayShifts();\n      renderAdminAttention();\n      loadTodayShifts(false);\n    }\n''',
'''    if(adminToday){\n      renderTodayShifts();\n      loadTodayShifts(false);\n    }\n''',
'tab attention duplicate'
)

replace_once(
'''      refreshResponsiveLayout();\n      await registerServiceWorker({checkUpdate:true});\n''',
'''      refreshResponsiveLayout();\n      if(Date.now()-lastServiceWorkerUpdateAt>60000){\n        await registerServiceWorker({checkUpdate:true});\n      }\n''',
'resume service worker throttle'
)

replace_once(
'''      const tasks=[syncFromCloud(false),loadTodayShifts(false)];\n      if(isAdmin()) tasks.push(syncWalletsCloud(false));\n''',
'''      const tasks=[syncFromCloud(false),loadTodayShifts(false)];\n      if(isAdmin() && !$("walletsPage").classList.contains("hidden")) tasks.push(syncWalletsCloud(false));\n''',
'resume wallet visibility'
)

replace_once(
'''      syncTimer=setInterval(()=>{\n        if(!document.hidden){\n          syncFromCloud(false);\n          if(isAdmin()) syncWalletsCloud(false);\n        }\n      },SYNC_INTERVAL_MS);\n''',
'''      syncTimer=setInterval(()=>{\n        if(!document.hidden){\n          syncFromCloud(false);\n          if(isAdmin() && !$("walletsPage").classList.contains("hidden")) syncWalletsCloud(false);\n        }\n      },SYNC_INTERVAL_MS);\n''',
'background wallet visibility'
)

if text==original:
    raise SystemExit('no changes made')
p.write_text(text,encoding='utf-8')
print('Stage 2 performance patch applied')
