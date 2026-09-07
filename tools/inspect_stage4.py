from pathlib import Path
import re

app=Path('app.js').read_text(encoding='utf-8')
lines=app.splitlines()
print('APP_BYTES',len(app.encode('utf-8')),'LINES',len(lines))

# List top-level-ish function declarations with line numbers.
for i,line in enumerate(lines,1):
    m=re.match(r'^  (?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(',line)
    if m:
        name=m.group(1)
        low=name.lower()
        if any(k in low for k in ['history','device','setting','system','schedule','shift','wallet','employee','render','fill','update']):
            print(f'{i:04d} {name}')

print('\nKEY REFERENCES')
for term in ['historyLoadSeq','deviceListCache','deviceListLoadState','updateSettingsSystemStatus','populateSettings','renderDevicePanel','loadHistory','renderHistory','fillHistoryFilters','pairDevice','verifyCurrentDevice','currentDeviceAccess']:
    hits=[]
    for i,line in enumerate(lines,1):
        if term in line:
            hits.append(i)
    print(term, hits[:40])
