from pathlib import Path
import re
text=Path('app.js').read_text(encoding='utf-8')
lines=text.splitlines()

names=['syncFromCloud','loadTodayShifts','refreshAppAfterResume','render','renderTodayShifts','renderAdminAttention','renderEmployeeToday','renderEmployeeCalendar','applyUserMode','switchTab','syncWalletsCloud']
for name in names:
    m=re.search(r'(?m)^\s*(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(',text)
    if not m:
        print(f'NOT FOUND {name}')
        continue
    start=text.count('\n',0,m.start())+1
    # simple function body parser
    i=text.find('{',m.end())
    depth=0; state='code'; quote=''; esc=False; end=i
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ''
        if state=='code':
            if c in "'\"`": state='str'; quote=c; esc=False
            elif c=='/' and n=='/': state='line'; i+=1
            elif c=='/' and n=='*': state='block'; i+=1
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:
                    end=i+1; break
        elif state=='str':
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: state='code'
        elif state=='line':
            if c=='\n': state='code'
        elif state=='block':
            if c=='*' and n=='/': state='code'; i+=1
        i+=1
    endline=text.count('\n',0,end)+1
    print(f'FUNCTION {name} {start}-{endline}')
    body='\n'.join(lines[start-1:min(endline,start+120)])
    print(body)
    print('---END---')

for token in ['setInterval(','setTimeout(','syncFromCloud(','loadTodayShifts(','syncWalletsCloud(','renderTodayShifts(','renderAdminAttention(','applyUserMode(','switchTab(']:
    print(f'COUNT {token} {text.count(token)}')
