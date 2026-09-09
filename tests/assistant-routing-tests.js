const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const source=fs.readFileSync('assistant-attendance.js','utf8');
const sandbox={
  console,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  setInterval:()=>1,
  clearInterval:()=>{},
  fetch:async()=>{throw new Error('fetch must not run in routing tests');},
  localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{
    addEventListener:()=>{},
    getElementById:()=>null,
    querySelector:()=>null,
    querySelectorAll:()=>[],
    createElement:()=>({setAttribute(){},appendChild(){},style:{}}),
    head:{appendChild(){}},
  },
  MAAssistantCore:{
    normalizeText:v=>String(v||'').toLowerCase().replace(/ё/g,'е').trim(),
  },
};
sandbox.window=sandbox;
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'assistant-attendance.js'});

const routing=sandbox.MAAssistantRouting;
assert(routing,'MAAssistantRouting must be exposed');
const cases=[
  ['Что сегодня не так?','owner'],
  ['Проверь график','owner'],
  ['Ошибки в графике','owner'],
  ['Кто завтра работает?','schedule'],
  ['Кто послезавтра работает?','schedule'],
  ['Покажи график Олега на неделю','schedule'],
  ['Кто сегодня опоздал?','attendance'],
  ['Кто сейчас на работе?','attendance'],
  ['Привет','default'],
];
for(const [text,expected] of cases){
  assert.strictEqual(routing.route(text),expected,`${text} -> ${expected}`);
}
console.log('assistant routing tests: OK');
