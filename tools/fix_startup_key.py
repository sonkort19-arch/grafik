from pathlib import Path
p=Path('index.html')
text=p.read_text(encoding='utf-8')
old='    if(key<MANAGER_ROSTER_FROM && isNovaWeekendRule(date,settings.service2)){' 
new='    if(dateKeyFromDate(date)<MANAGER_ROSTER_FROM && isNovaWeekendRule(date,settings.service2)){' 
count=text.count(old)
if count!=1:
    raise SystemExit(f'expected 1 match, found {count}')
text=text.replace(old,new,1)
p.write_text(text,encoding='utf-8')
print('startup-key-fix-ok')
