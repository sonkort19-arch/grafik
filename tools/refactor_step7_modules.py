from pathlib import Path
import re

p=Path('index.html')
text=p.read_text(encoding='utf-8')

# Load the new modules before the main application script.
old='<script src="employees.js"></script>\n<script src="supabase.js"></script>\n<script>'
new='<script src="employees.js"></script>\n<script src="supabase.js"></script>\n<script src="wallets.js"></script>\n<script src="admin.js"></script>\n<script>'
if old not in text:
    raise SystemExit('module script insertion point not found')
text=text.replace(old,new,1)

# Replace direct admin-session initialization with the admin module.
old_admin='  let adminSession = loadAdminSession();\n'
new_admin='''  let adminSession = null;\n  const {\n    loadAdminSession,\n    saveAdminSession,\n    isAdmin,\n    adminAccessToken\n  }=window.MAAdmin.create({\n    storageKey:AUTH_STORAGE_KEY,\n    getSession:()=>adminSession,\n    setSession:value=>{ adminSession=value; },\n    onSessionChange:()=>updateAuthUI()\n  });\n  adminSession=loadAdminSession();\n'''
if old_admin not in text:
    raise SystemExit('admin initialization anchor not found')
text=text.replace(old_admin,new_admin,1)

# Initialize wallet core immediately before wallet state is loaded.
old_wallet='  let walletState = loadWalletState();\n'
new_wallet='''  const {\n    walletCurrentMonthKey,walletMonthKeyFromIso,walletMonthLabel,walletShiftMonth,walletStartOfMonthIso,\n    walletLegacyDefaults,emptyWalletState,walletBackupBeforeMigration,normalizeWalletDefinition,\n    normalizeWalletTransaction,normalizeWalletState,loadWalletState,\n    parseMoneyInput,moneyInputValue,formatMoney,walletTransactionMonth,\n    walletNewId,walletNewOperationId,walletNewTransactionId,buildWalletOperation\n  }=window.MAWallets.create({\n    moscowParts,\n    SHIFT_TIMEZONE,\n    MONTHS,\n    WALLET_DATA_VERSION,\n    WALLET_STORAGE_KEY\n  });\n  let walletState = loadWalletState();\n'''
if old_wallet not in text:
    raise SystemExit('wallet initialization anchor not found')
text=text.replace(old_wallet,new_wallet,1)

# Robustly remove top-level named function declarations that now live in modules.
def remove_function(src,name):
    pat=re.compile(r'(?m)^\s*(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(')
    m=pat.search(src)
    if not m:
        raise RuntimeError(f'function not found: {name}')
    brace=src.find('{',m.end())
    if brace<0:
        raise RuntimeError(f'opening brace not found: {name}')
    i=brace
    depth=0
    state='code'
    quote=''
    esc=False
    end=None
    while i<len(src):
        c=src[i]
        n=src[i+1] if i+1<len(src) else ''
        if state=='code':
            if c in "'\"`":
                state='str'; quote=c; esc=False
            elif c=='/' and n=='/':
                state='line'; i+=1
            elif c=='/' and n=='*':
                state='block'; i+=1
            elif c=='{':
                depth+=1
            elif c=='}':
                depth-=1
                if depth==0:
                    end=i+1
                    break
        elif state=='str':
            if esc:
                esc=False
            elif c=='\\':
                esc=True
            elif c==quote:
                state='code'
        elif state=='line':
            if c=='\n': state='code'
        elif state=='block':
            if c=='*' and n=='/': state='code'; i+=1
        i+=1
    if end is None:
        raise RuntimeError(f'closing brace not found: {name}')
    # consume trailing spaces and up to two newlines
    while end<len(src) and src[end] in ' \t': end+=1
    if end<len(src) and src[end]=='\r': end+=1
    if end<len(src) and src[end]=='\n': end+=1
    if end<len(src) and src[end]=='\n': end+=1
    return src[:m.start()]+src[end:]

wallet_functions=[
    'walletCurrentMonthKey','walletMonthKeyFromIso','walletMonthLabel','walletShiftMonth','walletStartOfMonthIso',
    'walletLegacyDefaults','emptyWalletState','walletBackupBeforeMigration','normalizeWalletDefinition',
    'normalizeWalletTransaction','normalizeWalletState','loadWalletState',
    'parseMoneyInput','moneyInputValue','formatMoney','walletTransactionMonth',
    'walletNewId','walletNewOperationId','walletNewTransactionId','buildWalletOperation'
]
admin_functions=['loadAdminSession','saveAdminSession','isAdmin']
for name in wallet_functions+admin_functions:
    text=remove_function(text,name)

p.write_text(text,encoding='utf-8')
