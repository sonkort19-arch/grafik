from pathlib import Path
import re, hashlib

index_path=Path('index.html')
schedule_path=Path('schedule.js')
html=index_path.read_text(encoding='utf-8')
if schedule_path.exists():
    raise SystemExit('schedule.js already exists; refusing to overwrite unexpectedly')

start_m=re.search(r'(?m)^  function scheduleStartDate\(', html)
end_m=re.search(r'(?m)^  function buildMonthRows\(', html)
if not start_m or not end_m or end_m.start()<=start_m.start():
    raise SystemExit('Could not locate safe schedule block boundaries')

start,end=start_m.start(),end_m.start()
block=html[start:end]
file_block=block.rstrip('\n')+'\n'
required=[
    'scheduleStartDate','globalDayIndex','dateKeyFromDate','employeeCycleForDate',
    'employeeWorksOnDate','employeesForDate','employeeServiceForDate',
    'legacyBaseScheduleForDate','standardBaseScheduleForDate','fixedMasterPlanForDate',
    'balancedRosterState','baseScheduleForDate','daySchedule'
]
for name in required:
    if not re.search(rf'(?m)^  function {re.escape(name)}\(', block):
        raise SystemExit(f'Required schedule function missing from extracted block: {name}')
if '<script' in block.lower() or '</script>' in block.lower():
    raise SystemExit('Unexpected script tag inside schedule block')
if len(block)<10000:
    raise SystemExit(f'Schedule block unexpectedly small: {len(block)}')

# Find the main inline script and load schedule.js immediately before it.
marker='const SUPABASE_URL'
marker_pos=html.find(marker)
if marker_pos<0:
    raise SystemExit('Main application script marker not found')
script_pos=html.rfind('<script',0,marker_pos)
if script_pos<0:
    raise SystemExit('Main script tag not found')
if 'schedule.js' in html:
    raise SystemExit('schedule.js is already referenced in index.html')

comment='  // Schedule calculation logic moved to schedule.js\n\n'
without_block=html[:start]+comment+html[end:]
if script_pos>start:
    script_pos=script_pos-(end-start)+len(comment)
new_html=without_block[:script_pos]+'<script src="schedule.js"></script>\n'+without_block[script_pos:]

# Safety: only the extracted block and one external-script tag may differ.
roundtrip=new_html.replace('<script src="schedule.js"></script>\n','',1).replace(comment,block,1)
if roundtrip!=html:
    raise SystemExit('Safety check failed: index.html changed outside the intended schedule extraction')

# Preserve all executable code exactly; normalize only trailing blank lines at file EOF.
schedule_path.write_text(file_block,encoding='utf-8')
index_path.write_text(new_html,encoding='utf-8')

written=schedule_path.read_text(encoding='utf-8')
if written!=file_block:
    raise SystemExit('schedule.js content differs from normalized source block')
for name in required:
    if re.search(rf'(?m)^  function {re.escape(name)}\(', new_html):
        raise SystemExit(f'{name} still remains in index.html')
if not re.search(r'(?m)^  function buildMonthRows\(', new_html):
    raise SystemExit('Boundary function buildMonthRows was accidentally moved')

print('Schedule source block chars:',len(block))
print('Schedule source sha256:',hashlib.sha256(block.encode('utf-8')).hexdigest())
print('schedule.js chars:',len(file_block))
print('Extracted functions:',', '.join(required))
print('Outside-block HTML unchanged: yes')
