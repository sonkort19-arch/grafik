from pathlib import Path

p=Path('index.html')
text=p.read_text(encoding='utf-8')

anchor='<script>\n(function(){'
start=text.rfind(anchor)
if start<0:
    raise SystemExit('main inline script anchor not found')

content_start=start+len('<script>\n')
end=text.find('</script>',content_start)
if end<0:
    raise SystemExit('main inline script closing tag not found')

app=text[content_start:end]
if not app.startswith('(function(){'):
    raise SystemExit('unexpected app.js start')
if not app.rstrip().endswith('})();'):
    raise SystemExit('unexpected app.js end')
if '<script' in app.lower() or '</script>' in app.lower():
    raise SystemExit('script tag found inside main JavaScript')

app_path=Path('app.js')
if app_path.exists():
    raise SystemExit('app.js already exists; refusing to overwrite')
app_path.write_text(app,encoding='utf-8')

replacement='<script src="app.js"></script>\n'
new_text=text[:start]+replacement+text[end+len('</script>'):]

if anchor in new_text:
    raise SystemExit('inline app script still present after extraction')
expected=[
    '<script src="schedule.js"></script>',
    '<script src="shifts.js"></script>',
    '<script src="employees.js"></script>',
    '<script src="supabase.js"></script>',
    '<script src="wallets.js"></script>',
    '<script src="admin.js"></script>',
    '<script src="app.js"></script>',
]
positions=[new_text.find(x) for x in expected]
if any(x<0 for x in positions):
    raise SystemExit(f'missing script reference: {positions}')
if positions!=sorted(positions):
    raise SystemExit(f'wrong script order: {positions}')

p.write_text(new_text,encoding='utf-8')
print(f'Extracted {len(app.encode("utf-8"))} bytes into app.js')
