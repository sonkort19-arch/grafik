const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('assistant-attendance.js','utf8');
assert(src.includes("content:'MA'"),'launcher must render MA mark');
assert(src.includes('aria-label\",\"Открыть помощника МА График'),'launcher must keep accessible label');
assert(src.includes('bottom:calc(84px + env(safe-area-inset-bottom))'),'mobile launcher must respect bottom nav and safe area');
assert(src.includes('width:56px')&&src.includes('height:56px'),'mobile touch target must be comfortably above 44px');
assert(src.includes('.ma-assistant-launch:active{transform:scale(.96)}'),'launcher needs tactile press feedback');
console.log('assistant launcher tests: OK');
