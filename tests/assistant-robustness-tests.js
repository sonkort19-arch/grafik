"use strict";

const assert=require("assert");
const fs=require("fs");
const vm=require("vm");

global.window={};
vm.runInThisContext(fs.readFileSync("assistant-core.js","utf8"),{filename:"assistant-core.js"});
const core=window.MAAssistantCore;
const names=["Олег","Георгий","Асик","Дина"];
let passed=0;

function test(name,fn){
  try{fn();passed++;console.log(`✓ ${name}`);}
  catch(error){console.error(`✗ ${name}`);throw error;}
}

// 1
test("разговорное: кто завтра работает???",()=>{
  assert.strictEqual(core.parseDate("кто завтра работает???","2026-09-09").key,"2026-09-10");
});

// 2
test("разговорное: а послезавтра кто на смене",()=>{
  assert.strictEqual(core.parseDate("а послезавтра кто на смене","2026-09-09").key,"2026-09-11");
});

// 3
test("дата через слэш: кто 12/09 работает",()=>{
  assert.strictEqual(core.parseDate("кто 12/09 работает","2026-09-09").key,"2026-09-12");
});

// 4
test("дата через дефис: кто 12-09 работает",()=>{
  assert.strictEqual(core.parseDate("кто 12-09 работает","2026-09-09").key,"2026-09-12");
});

// 5
test("фраза: покажи график на следующую неделю",()=>{
  assert.deepStrictEqual(core.parseRange("покажи график на следующую неделю","2026-09-09"),{from:"2026-09-14",to:"2026-09-20",days:7});
});

// 6
test("фраза: график Олега на 14 дней",()=>{
  assert.deepStrictEqual(core.parseRange("график Олега на 14 дней","2026-09-09"),{from:"2026-09-09",to:"2026-09-22",days:14});
  assert.strictEqual(core.findMentionedEmployees("график Олега на 14 дней",names)[0].name,"Олег");
});

// 7
test("точка: кто в Мобе завтра",()=>{
  assert.strictEqual(core.parseService("кто в Мобе завтра"),"Моба");
});

// 8
test("точка: кто в Нове 12 сентября",()=>{
  assert.strictEqual(core.parseService("кто в Нове 12 сентября"),"Нова");
});

// 9
test("замена с лишним словом пожалуйста",()=>{
  assert.deepStrictEqual(core.parseReplacement("12 сентября поставь Георгия вместо Асика пожалуйста",names),{oldName:"Асик",newName:"Георгий",kind:"instead"});
});

// 10
test("замени Асика на Георгия завтра",()=>{
  assert.deepStrictEqual(core.parseReplacement("замени Асика на Георгия завтра",names),{oldName:"Асик",newName:"Георгий",kind:"replace"});
});

// 11
test("разговорная замена: можно Олега заменить Георгием",()=>{
  const parsed=core.parseReplacement("можно Олега заменить Георгием завтра",names);
  assert(parsed);
  assert.strictEqual(parsed.oldName,"Олег");
  assert.strictEqual(parsed.newName,"Георгий");
});

// 12
test("старое имя Аслан распознаётся как Асик в замене",()=>{
  const parsed=core.parseReplacement("поставь Георгия вместо Аслана",names);
  assert(parsed);
  assert.strictEqual(parsed.oldName,"Асик");
  assert.strictEqual(parsed.newName,"Георгий");
});

// 13
test("дательный падеж: дай Дине выходной завтра",()=>{
  const found=core.findMentionedEmployees("дай Дине выходной завтра",names);
  assert.strictEqual(found[0].name,"Дина");
});

// 14
test("родительный падеж: покажи график Георгия",()=>{
  const found=core.findMentionedEmployees("покажи график Георгия",names);
  assert.strictEqual(found[0].name,"Георгий");
});

// 15
test("полное название точки: Мобильный Ангел",()=>{
  assert.strictEqual(core.parseService("кто завтра в Мобильном Ангеле"),"Моба");
});

// 16
test("короткая отмена: не меняй",()=>{
  assert.strictEqual(core.isCancellation("не меняй"),true);
});

// 17
test("безопасная отмена: пока ничего не меняй",()=>{
  assert.strictEqual(core.isCancellation("пока ничего не меняй"),true);
  assert.strictEqual(core.isConfirmation("пока ничего не меняй"),false);
});

// 18
test("разговорная отмена: давай не будем менять",()=>{
  assert.strictEqual(core.isCancellation("давай не будем менять"),true);
  assert.strictEqual(core.isConfirmation("давай не будем менять"),false);
});

// 19
test("явное подтверждение: подтверждаю",()=>{
  assert.strictEqual(core.isConfirmation("подтверждаю"),true);
  assert.strictEqual(core.isCancellation("подтверждаю"),false);
});

// 20
test("смешанная фраза не должна подтверждать: сделай, но не меняй",()=>{
  assert.strictEqual(core.isConfirmation("сделай, но не меняй"),false);
  assert.strictEqual(core.isCancellation("сделай, но не меняй"),true);
});

console.log(`\nMA Assistant robustness: ${passed}/20 тестов пройдено.`);
