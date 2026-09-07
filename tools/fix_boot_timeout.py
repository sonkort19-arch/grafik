from pathlib import Path

p = Path("app.js")
text = p.read_text(encoding="utf-8")
old = '''    if(hasDeviceToken && !cachedDevice){
      try{
        await refreshDeviceAccess();
      }catch(e){
        console.error("initial device check",e);
      }
    }
'''
new = '''    if(hasDeviceToken && !cachedDevice){
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
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected one startup block, found {count}")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("startup timeout patch applied")
