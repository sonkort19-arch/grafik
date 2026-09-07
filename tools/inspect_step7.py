from pathlib import Path
import re
text=Path('index.html').read_text(encoding='utf-8')

def extract_function(name):
    m=re.search(r'(?m)^\s*(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(',text)
    if not m: return None
    brace=text.find('{',m.end())
    if brace<0: return None
    i=brace; depth=0; state='code'; quote=''; esc=False
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ''
        if state=='code':
            if c in "'\"`": state='str'; quote=c; esc=False
            elif c=='/' and n=='/': state='line'; i+=1
            elif c=='/' and n=='*': state='block'; i+=1
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0: return text[m.start():i+1]
        elif state=='str':
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: state='code'
        elif state=='line':
            if c=='\n': state='code'
        elif state=='block':
            if c=='*' and n=='/': state='code'; i+=1
        i+=1
    return None

names=[]
for m in re.finditer(r'(?m)^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(',text):
    line=text.count('\n',0,m.start())+1
    if 1395<=line<2927: names.append((line,m.group(1)))

bad_tokens=['walletState','walletBusy','walletCloudSyncPromise','lastWalletCloudFetchAt','walletCloudNeedsSetup','walletViewMonthKey','walletListFilter','pendingArchiveWalletId','walletEditingId','walletCorrectionOperationId','$(', 'authFetch','getAdminToken','isAdmin','toast(','confirm(','prompt(','beginButtonBusy','endButtonBusy','saveAdminSession','logAppError']
print('PURE_CANDIDATES')
for line,name in names:
    fn=extract_function(name) or ''
    if not any(tok in fn for tok in bad_tokens):
        print(f'{line}: {name}')
