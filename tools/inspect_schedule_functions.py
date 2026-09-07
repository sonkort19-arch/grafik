from pathlib import Path
import re

text=Path('index.html').read_text(encoding='utf-8')
funcs=[]
for m in re.finditer(r'(?m)^\s*function\s+([A-Za-z_$][\w$]*)\s*\(', text):
    line=text.count('\n',0,m.start())+1
    funcs.append((m.group(1),line,m.start()))

names=[x[0] for x in funcs]
for target in ['balancedRosterState','baseScheduleForDate','daySchedule','employeesForDate','standardBaseScheduleForDate','expectedForDate']:
    if target in names:
        i=names.index(target)
        print(f'--- {target} at function index {i}, line {funcs[i][1]} ---')
        for name,line,_ in funcs[max(0,i-15):min(len(funcs),i+20)]:
            print(f'{line}: {name}')
    else:
        print(f'--- {target}: NOT FOUND ---')
