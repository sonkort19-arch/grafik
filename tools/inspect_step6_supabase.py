from pathlib import Path
text=Path('index.html').read_text(encoding='utf-8')
needles=[
'function cloudConfigured',
'function sleepMs',
'async function httpErrorFromResponse',
'function classifySyncError',
'function logAppError',
'async function authFetch',
'async function loginAdmin',
'async function refreshAdminSession',
'async function getAdminToken',
'function currentAdminUserId',
'function loadAdminSession',
'function saveAdminSession',
'async function shiftFunction',
]
for n in needles:
    i=text.find(n)
    if i<0:
        print('NOT FOUND',n)
    else:
        line=text.count('\n',0,i)+1
        print(f'{line}: {n}')
