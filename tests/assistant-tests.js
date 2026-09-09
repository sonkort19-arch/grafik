"use strict";

const assert=require("assert");
const fs=require("fs");
const vm=require("vm");

global.window={};
vm.runInThisContext(fs.readFileSync("assistant-core.js","utf8"),{filename:"assistant-core.js"});
const core=window.MAAssistantCore;

function test(name,fn){
  try{fn();console.log(`✓ ${name}`);}
  catch(error){console.error(`✗ ${name}`);throw error;}
}

test("понимает сегодня/завтра/послезавтра",()=>{
  assert.strictEqual(core.parseDate("кто сегодня работает","2026-09-09").key,"2026-09-09");
  assert.strictEqual(core.parseDate("кто завтра работает","2026-09-09").key,"2026-09-10");
  assert.strictEqual(core.parseDate("а послезавтра?","2026-09-09").key,"2026-09-11");
});

test("понимает дату словами и цифрами",()=>{
  assert.strictEqual(core.parseDate("12 сентября поставь Георгия","2026-09-09").key,"2026-09-12");
  assert.strictEqual(core.parseDate("на 15.09 замена","2026-09-09").key,"2026-09-15");
});

test("понимает неделю и две недели",()=>{
  assert.deepStrictEqual(core.parseRange("покажи график на неделю","2026-09-09"),{from:"2026-09-09",to:"2026-09-15",days:7});
  assert.deepStrictEqual(core.parseRange("график Олега на две недели","2026-09-09"),{from:"2026-09-09",to:"2026-09-22",days:14});
});

test("следующая неделя начинается с понедельника",()=>{
  assert.deepStrictEqual(core.parseRange("покажи следующую неделю","2026-09-09"),{from:"2026-09-14",to:"2026-09-20",days:7});
});

test("понимает названия точек в разных падежах",()=>{
  assert.strictEqual(core.parseService("кто завтра в Мобе"),"Моба");
  assert.strictEqual(core.parseService("поставь Георгия в Нову"),"Нова");
});

test("понимает конструкцию поставь X вместо Y",()=>{
  const parsed=core.parseReplacement("12 сентября поставь Георгия вместо Асика",["Олег","Георгий","Асик"]);
  assert.deepStrictEqual(parsed,{oldName:"Асик",newName:"Георгий",kind:"instead"});
});

test("понимает конструкцию замени X на Y",()=>{
  const parsed=core.parseReplacement("замени Асика на Георгия 12 сентября",["Олег","Георгий","Асик"]);
  assert.deepStrictEqual(parsed,{oldName:"Асик",newName:"Георгий",kind:"replace"});
});

test("Асик распознаётся по старому варианту Аслан",()=>{
  const found=core.findMentionedEmployees("покажи график Аслана",["Асик","Олег"]);
  assert.strictEqual(found.length,1);
  assert.strictEqual(found[0].name,"Асик");
});

test("подтверждение и отмена не путаются",()=>{
  assert.strictEqual(core.isConfirmation("Подтверждаю"),true);
  assert.strictEqual(core.isCancellation("не меняй"),true);
  assert.strictEqual(core.isConfirmation("пока ничего не меняй"),false);
});

test("помощник загружается только при админ-сессии и удаляется после выхода",()=>{
  const safety=fs.readFileSync("safety.js","utf8");
  assert(safety.includes('const AUTH_KEY="ma_schedule_admin_session_v1"'));
  assert(safety.includes("function hasAdminSession()"));
  assert(safety.includes("if(allowed)startAssistant();"));
  assert(safety.includes("else removeAssistantUi();"));
  assert(safety.includes('document.getElementById("maAssistantLaunch")?.remove()'));
  assert(safety.includes('document.getElementById("maAssistantBackdrop")?.remove()'));
});

console.log("\nMA Assistant: все тесты пройдены.");