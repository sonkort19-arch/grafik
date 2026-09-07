from pathlib import Path
import re

app=Path('app.js').read_text(encoding='utf-8')
index=Path('index.html').read_text(encoding='utf-8')

def print_function(text,name):
    m=re.search(r'(?m)^\s*(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(',text)
    if not m:
        print('NOT FOUND',name); return
    i=text.find('{',m.end()); depth=0; state='code'; quote=''; esc=False; end=i
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ''
        if state=='code':
            if c in "'\"`": state='str'; quote=c; esc=False
            elif c=='/' and n=='/': state='line'; i+=1
            elif c=='/' and n=='*': state='block'; i+=1
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0: end=i+1; break
        elif state=='str':
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: state='code'
        elif state=='line':
            if c=='\n': state='code'
        elif state=='block':
            if c=='*' and n=='/': state='code'; i+=1
        i+=1
    start_line=app.count('\n',0,m.start())+1
    end_line=app.count('\n',0,end)+1
    print(f'FUNCTION {name} {start_line}-{end_line}')
    print(app[m.start():end])
    print('---END---')

for n in ['logAppError','updateSettingsSystemStatus','populateSettings','updateCloudSettingsState']:
    print_function(app,n)

for needle in ['settingsPage','systemStatus','system','pushState','enablePushBtn']:
    p=index.find(needle)
    if p>=0:
        a=max(0,index.rfind('\n',0,max(0,p-2500)))
        b=min(len(index), index.find('\n',min(len(index),p+4000)))
        print('INDEX AROUND',needle)
        print(index[a:b])
        print('---END INDEX---')

print('SCRIPT TAGS:')
for line in index.splitlines():
    if '<script' in line: print(line)
