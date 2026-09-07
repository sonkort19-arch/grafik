from pathlib import Path

p=Path('index.html')
text=p.read_text(encoding='utf-8')

# 1) Load cloud module before the main application script.
old='<script src="employees.js"></script>\n<script>'
new='<script src="employees.js"></script>\n<script src="supabase.js"></script>\n<script>'
if old not in text:
    raise SystemExit('script insertion point not found')
text=text.replace(old,new,1)

# 2) Initialize the Supabase module immediately after adminSession exists.
anchor='  let adminSession = loadAdminSession();\n'
module_init='''  let adminSession = loadAdminSession();\n  const {\n    cloudConfigured,\n    sleepMs,\n    httpErrorFromResponse,\n    classifySyncError,\n    authFetch,\n    loginAdmin,\n    refreshAdminSession,\n    getAdminToken\n  }=window.MASupabase.create({\n    url:SUPABASE_URL,\n    publishableKey:SUPABASE_PUBLISHABLE_KEY,\n    getAdminSession:()=>adminSession,\n    saveAdminSession\n  });\n'''
if anchor not in text:
    raise SystemExit('adminSession anchor not found')
text=text.replace(anchor,module_init,1)

# 3) Remove old cloudConfigured implementation; it now comes from supabase.js.
start=text.find('  function cloudConfigured(){')
end=text.find('  function loadAdminSession(){',start)
if start<0 or end<0:
    raise SystemExit('cloudConfigured block not found')
text=text[:start]+'  // Supabase connection checks are provided by supabase.js\n\n'+text[end:]

# 4) Remove networking/auth implementations now provided by supabase.js.
start=text.find('  function sleepMs(ms){')
end=text.find('  function addDaysToDateString(dateStr,days){',start)
if start<0 or end<0:
    raise SystemExit('Supabase networking block not found')
text=text[:start]+'  // Supabase REST/auth helpers are provided by supabase.js\n\n'+text[end:]

p.write_text(text,encoding='utf-8')
