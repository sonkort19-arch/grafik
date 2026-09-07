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
block='\n'.join(lines[wallet_start-1:wallet_end-1])

# Strip comments and strings/templates approximately for identifier analysis.
s=block
s=re.sub(r'/\*.*?\*/',' ',s,flags=re.S)
s=re.sub(r'//.*',' ',s)
s=re.sub(r'`(?:\\.|[^`])*`',' ',s,flags=re.S)
s=re.sub(r'"(?:\\.|[^"\\])*"',' ',s,flags=re.S)
s=re.sub(r"'(?:\\.|[^'\\])*'",' ',s,flags=re.S)

internal=set(re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(',s))
internal.update(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)',s))
# params from every function/arrow-like simple signature
for params in re.findall(r'\bfunction\s*[A-Za-z_$]*\s*\(([^)]*)\)',s):
    internal.update(re.findall(r'\b[A-Za-z_$][\w$]*\b',params))

keywords=set('async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield true false null undefined of'.split())
builtins=set('Array Object String Number Boolean Math Date JSON Intl Promise Set Map WeakMap WeakSet RegExp Error TypeError console window document navigator localStorage crypto fetch URL URLSearchParams FormData AbortController requestAnimationFrame setTimeout clearTimeout parseInt parseFloat isNaN Infinity NaN'.split())
idents=set(re.findall(r'\b[A-Za-z_$][\w$]*\b',s))
# remove property names directly preceded by dot
props=set(m.group(1) for m in re.finditer(r'\.\s*([A-Za-z_$][\w$]*)',s))
# remove likely object literal keys followed by colon
keys=set(m.group(1) for m in re.finditer(r'\b([A-Za-z_$][\w$]*)\s*:',s))
free=sorted(idents-internal-keywords-builtins-props-keys)
print('FREE_IDENTIFIERS')
for x in free:
    print(x)

print('OUTSIDE_STATE')
for token in ['walletState','walletBusy','walletCloudSyncPromise','lastWalletCloudFetchAt','walletCloudNeedsSetup','walletViewMonthKey','walletListFilter','pendingArchiveWalletId','walletEditingId','walletCorrectionOperationId']:
    outside=[]
    for i,line in enumerate(lines,1):
        if token in line and not (wallet_start<=i<wallet_end):
            outside.append(i)
    print(token,outside)
