from pathlib import Path

p = Path("app.js")
text = p.read_text(encoding="utf-8")

old_timeout = '''    if(hasDeviceToken && !cachedDevice){
      try{
        await refreshDeviceAccess();
      }catch(e){
        console.error("initial device check",e);
      }
    }
'''
new_timeout = '''    if(hasDeviceToken && !cachedDevice){
      let initialDeviceResolved=false;
      const initialDeviceCheck=Promise.resolve()
        .then(()=>refreshDeviceAccess())
        .catch(e=>{
          console.error("initial device check",e);
          return false;
        });
      await Promise.race([
        initialDeviceCheck.then(()=>{ initialDeviceResolved=true; }),
        new Promise(resolve=>setTimeout(resolve,3500))
      ]);
      if(!initialDeviceResolved){
        initialDeviceCheck.then(()=>{
          if(appInitialized && currentDeviceAccess.allowed){
            updateAuthUI();
            applyUserMode();
            switchTab(isEmployeePhoneMode()?"employeeToday":"adminToday");
          }
        });
      }
    }
'''
if old_timeout in text:
    text = text.replace(old_timeout, new_timeout, 1)
elif "initialDeviceResolved" not in text:
    raise SystemExit("startup timeout block not found")

old_kpi = '''    getEmployeesForDate:dateStr=>employeesForDate(dateObjectFromKey(dateStr)),
    isNoManagerValue,
    shiftStartForService,
'''
new_kpi = '''    getEmployeesForDate:dateStr=>employeesForDate(dateObjectFromKey(dateStr)),
    isNoManagerValue:(...args)=>isNoManagerValue(...args),
    shiftStartForService,
'''
if old_kpi in text:
    text = text.replace(old_kpi, new_kpi, 1)
elif "isNoManagerValue:(...args)=>isNoManagerValue(...args)" not in text:
    raise SystemExit("KPI initialization block not found")

p.write_text(text, encoding="utf-8")
print("startup safety patches applied")
