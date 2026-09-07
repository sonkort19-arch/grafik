from pathlib import Path
import re
h=Path('index.html').read_text(encoding='utf-8')
for m in re.finditer(r'(?m)^  (?:async )?function\s+([A-Za-z0-9_$]+)\s*\(', h):
    name=m.group(1)
    if 'employee' in name.lower() or name in {'selectedEmployee','ensureEmployeeSelected'}:
        line=h.count('\n',0,m.start())+1
        print(f'{line}: {name}')
