from pathlib import Path
import re

index_path=Path('index.html')
employees_path=Path('employees.js')
h=index_path.read_text(encoding='utf-8')
if employees_path.exists():
    raise SystemExit('employees.js already exists; refusing to overwrite')

TARGETS=[
 'activeEmployeesForDate','activeEmployeeNames','activeManagerNames','allHistoricalManagerNames',
 'loadEmployeeName','saveEmployeeName','employeePushName','saveEmployeePushName','selectedEmployee',
 'dateKeyLocal','employeeAssignmentForDate','employeeUpcomingShifts','employeeServiceState',
 'employeeNamesInMonth','monthHasUnassigned'
]

def span_for(name,text):
    pat=re.compile(rf'(?m)^  (?:async )?function {re.escape(name)}\s*\(')
    m=pat.search(text)
    if not m: raise SystemExit(f'Function not found: {name}')
    nextm=re.search(r'(?m)^  (?:async )?function [A-Za-z0-9_$]+\s*\(', text[m.end():])
    if nextm:
        end=m.end()+nextm.start()
    else:
        end=len(text)
    # Trim only extra blank lines from the extracted piece; caller preserves one separator.
    return m.start(),end,text[m.start():end].rstrip()+"\n"

# Capture exact original functions first.
blocks={}
for name in TARGETS:
    s,e,b=span_for(name,h)
    blocks[name]=b

# Remove targets from bottom to top so offsets stay valid.
spans=[]
for name in TARGETS:
    s,e,_=span_for(name,h)
    spans.append((s,e,name))
for s,e,name in sorted(spans,reverse=True):
    h=h[:s]+h[e:]

# Add external module before the main inline app script.
needle='<script src="shifts.js"></script>\n<script>'
if needle not in h: raise SystemExit('Script insertion point not found')
h=h.replace(needle,'<script src="shifts.js"></script>\n<script src="employees.js"></script>\n<script>',1)

# Initialize module immediately after buildMonthRows, where all dependencies are available.
m=re.search(r'(?m)^  function buildMonthRows\s*\(',h)
if not m: raise SystemExit('buildMonthRows not found')
nextm=re.search(r'(?m)^  (?:async )?function [A-Za-z0-9_$]+\s*\(',h[m.end():])
if not nextm: raise SystemExit('Could not find boundary after buildMonthRows')
insert_at=m.end()+nextm.start()
init='''  const {\n    activeEmployeesForDate,activeEmployeeNames,activeManagerNames,allHistoricalManagerNames,\n    loadEmployeeName,saveEmployeeName,employeePushName,saveEmployeePushName,selectedEmployee,\n    dateKeyLocal,employeeAssignmentForDate,employeeUpcomingShifts,employeeServiceState,\n    employeeNamesInMonth,monthHasUnassigned\n  }=window.MAEmployees.create({\n    getSettings:()=>settings,\n    moscowParts,\n    dateObjectFromKey,\n    employeesForDate,\n    MANAGER_ROSTER_FROM,\n    EMPLOYEE_STORAGE_KEY,\n    EMPLOYEE_PUSH_NAME_KEY,\n    expectedForDate,\n    getCurrentMonthIndex,\n    monthInfo,\n    buildMonthRows,\n    isNoManagerValue,\n    isNoMasterValue,\n    getCurrentShiftRows:()=>currentShiftRows,\n    shiftStartForService,\n    shiftMinutes,\n    formatMoscowTime,\n    escapeHtml\n  });\n\n'''
h=h[:insert_at]+init+h[insert_at:]

# Build employees.js from exact function bodies, with only one intentional mutable-state adapter.
body='\n'.join(blocks[n].strip('\n') for n in TARGETS)
body=body.replace('const row=currentShiftRows.find(x=>x.service===service)||null;',
                  'const row=(deps.getCurrentShiftRows()||[]).find(x=>x.service===service)||null;',1)
module='''(function(global){\n  "use strict";\n  global.MAEmployees={\n    create(deps){\n      if(!deps || typeof deps.getSettings!=="function") throw new Error("MA Employees: getSettings dependency is required");\n      const {\n        moscowParts,dateObjectFromKey,employeesForDate,MANAGER_ROSTER_FROM,\n        EMPLOYEE_STORAGE_KEY,EMPLOYEE_PUSH_NAME_KEY,expectedForDate,getCurrentMonthIndex,\n        monthInfo,buildMonthRows,isNoManagerValue,isNoMasterValue,shiftStartForService,\n        shiftMinutes,formatMoscowTime,escapeHtml\n      }=deps;\n      const settings=new Proxy({}, {\n        get(_target,prop){ return (deps.getSettings()||{})[prop]; },\n        set(_target,prop,value){ const s=deps.getSettings(); if(!s) return false; s[prop]=value; return true; },\n        ownKeys(){ return Reflect.ownKeys(deps.getSettings()||{}); },\n        getOwnPropertyDescriptor(){ return {enumerable:true,configurable:true}; }\n      });\n\n'''+body+'''\n\n      return {\n        activeEmployeesForDate,activeEmployeeNames,activeManagerNames,allHistoricalManagerNames,\n        loadEmployeeName,saveEmployeeName,employeePushName,saveEmployeePushName,selectedEmployee,\n        dateKeyLocal,employeeAssignmentForDate,employeeUpcomingShifts,employeeServiceState,\n        employeeNamesInMonth,monthHasUnassigned\n      };\n    }\n  };\n})(window);\n'''

# Safety checks.
for name in TARGETS:
    if re.search(rf'(?m)^  (?:async )?function {re.escape(name)}\s*\(',h):
        raise SystemExit(f'{name} still remains in index.html')
    if f'function {name}' not in module:
        raise SystemExit(f'{name} missing from employees.js')
if '<script src="employees.js"></script>' not in h:
    raise SystemExit('employees.js not referenced')
if 'window.MAEmployees.create' not in h:
    raise SystemExit('MAEmployees factory not initialized')

employees_path.write_text(module,encoding='utf-8')
index_path.write_text(h,encoding='utf-8')
print('Moved employee functions:', ', '.join(TARGETS))
print('employees.js chars:',len(module))
