from pathlib import Path
import re
text=Path('index.html').read_text(encoding='utf-8')
for i,line in enumerate(text.splitlines(),1):
    m=re.match(r'\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(',line)
    if not m: continue
    name=m.group(1)
    low=name.lower()
    if any(k in low for k in ['wallet','admin','employeeeditor','employeeleft','newemployee','scheduleeditor','device','history','pin']):
        print(f'{i}: {name}')
