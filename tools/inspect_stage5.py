from pathlib import Path
import re

app=Path('app.js').read_text(encoding='utf-8')
html=Path('index.html').read_text(encoding='utf-8')
settings=Path('settings.js').read_text(encoding='utf-8')

names=[
 'syncFromCloud','saveToCloud','exportSettings','importSettings','clearWalletCloudHistory',
 'clearWalletHistoryAndBalances','saveWalletState','syncWalletsCloud','saveSettings',
 'initApp','populateSettings','updateSettingsSystemStatus'
]

def function_block(text,name):
    m=re.search(r'(?m)^\s*(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(',text)
    if not m:return None
    start=m.start(); i=text.find('{',m.end()); depth=0; state='code'; quote=''; esc=False
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ''
        if state=='code':
            if c in "'\"`": state='str'; quote=c; esc=False
            elif c=='/' and n=='/': state='line'; i+=1
            elif c=='/' and n=='*': state='block'; i+=1
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:return text[start:i+1]
        elif state=='str':
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: state='code'
        elif state=='line':
            if c=='\n':state='code'
        elif state=='block':
            if c=='*' and n=='/':state='code';i+=1
        i+=1
    return None

print('APP',len(app.encode()),len(app.splitlines()))
for name in names:
    source=function_block(app,name) or function_block(settings,name)
    print('\n===== '+name+' =====')
    print(source if source else 'NOT FOUND')

print('\n===== SETTINGS HTML IDs containing backup/import/export/system =====')
for i,line in enumerate(html.splitlines(),1):
    low=line.lower()
    if any(k in low for k in ['export','import','backup','резерв','system-health','settings-inline-details']):
        print(f'{i}: {line}')

print('\n===== LOCAL STORAGE direct writes =====')
for i,line in enumerate(app.splitlines(),1):
    if 'localStorage.setItem' in line or 'localStorage.removeItem' in line:
        print(f'{i}: {line.strip()}')
