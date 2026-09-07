from pathlib import Path
import re
text=Path('index.html').read_text(encoding='utf-8')
lines=text.splitlines()

def line_of(needle):
    for i,l in enumerate(lines,1):
        if needle in l:
            return i
    return None

wallet_start=line_of('function walletCurrentMonthKey')
wallet_end=line_of('function isMobileAdminNav')
print('WALLET_RANGE',wallet_start,wallet_end)

wallet_names=[]
for i,line in enumerate(lines,1):
    m=re.match(r'\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(',line)
    if m and wallet_start and wallet_end and wallet_start<=i<wallet_end:
        wallet_names.append(m.group(1))
print('WALLET_FUNCTIONS',len(wallet_names))

for token in ['walletState','walletBusy','walletCloudSyncPromise','lastWalletCloudFetchAt','walletCloudNeedsSetup','walletViewMonthKey','walletListFilter','pendingArchiveWalletId','walletEditingId','walletCorrectionOperationId']:
    outside=[]
    for i,line in enumerate(lines,1):
        if token in line and not (wallet_start and wallet_end and wallet_start<=i<wallet_end):
            outside.append(i)
    print('OUTSIDE',token,outside)

print('ADMIN_CANDIDATES')
for i,line in enumerate(lines,1):
    m=re.match(r'\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(',line)
    if not m: continue
    name=m.group(1)
    low=name.lower()
    if any(k in low for k in ['admin','device','history','pin','employeeeditor','employeeleft','newemployee','scheduleeditor']):
        print(f'{i}: {name}')
