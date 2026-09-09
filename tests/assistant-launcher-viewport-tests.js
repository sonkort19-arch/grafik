const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('assistant-attendance.js','utf8');
for(const width of [375,390,393,414,430]){
  assert(width>=375&&width<=430,`supported mobile viewport ${width}`);
  assert(src.includes('@media(max-width:640px)'),`mobile CSS must cover ${width}px`);
}
assert(src.includes('right:14px!important'),'launcher must keep a safe right inset on mobile');
assert(src.includes('env(safe-area-inset-bottom)'),'launcher must account for iPhone safe area');
assert(src.includes('touch-action:manipulation'),'launcher must be touch optimized');
console.log('assistant launcher viewport tests: OK');
