"use strict";

const assert=require("assert");
const fs=require("fs");

const source=fs.readFileSync("assistant.js","utf8");

function test(name,fn){
  try{fn();console.log(`✓ ${name}`);}
  catch(error){console.error(`✗ ${name}`);throw error;}
}

test("быстрые подсказки используют grid без горизонтального скролла",()=>{
  assert(source.includes(".ma-assistant-examples{"));
  assert(source.includes("display:grid"));
  assert(source.includes("grid-template-columns:repeat(2,minmax(0,1fr))"));
  assert(!/\.ma-assistant-examples\{[^}]*overflow:auto/.test(source));
});

test("третья подсказка занимает всю строку",()=>{
  assert(source.includes(".ma-assistant-examples button:nth-child(3){grid-column:1/-1}"));
});

test("поле ввода имеет короткий placeholder",()=>{
  assert(source.includes('placeholder="Напиши команду…"'));
  assert(!source.includes('placeholder="Например: кто завтра работает?"'));
});

test("compose не даёт дочерним элементам вылезать за экран",()=>{
  assert(source.includes(".ma-assistant-compose>*{min-width:0;box-sizing:border-box}"));
  assert(source.includes(".ma-assistant-input{flex:1 1 auto"));
  assert(source.includes(".ma-assistant-send{flex:0 0 auto"));
});

test("панель и сообщения защищены от horizontal overflow",()=>{
  assert(source.includes("max-width:100%"));
  assert(source.includes("overflow-wrap:anywhere"));
  assert(source.includes("min-height:0"));
});

test("iPhone safe area и динамическая высота учтены",()=>{
  assert(source.includes("100dvh"));
  assert(source.includes("env(safe-area-inset-top)"));
  assert(source.includes("env(safe-area-inset-bottom)"));
});

test("на очень узком экране подсказки переходят в одну колонку",()=>{
  assert(source.includes("@media(max-width:340px)"));
  assert(source.includes("grid-template-columns:1fr"));
});

console.log("\nMA Assistant UI: все проверки пройдены.");
