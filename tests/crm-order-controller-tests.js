const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

function tick(){return new Promise(resolve=>setImmediate(resolve));}
function makeClassList(initial=[]){const set=new Set(initial);return{add(...x){x.forEach(v=>set.add(v));},remove(...x){x.forEach(v=>set.delete(v));},contains(v){return set.has(v);}};}

const bodyEl={innerHTML:'',dataset:{},rendered:false,querySelector(sel){return sel==='.order-layout'&&this.rendered?{}:null;}};
const overlay={classList:makeClassList(['hidden'])};
const elements={repairDetailBody:bodyEl,repairDetailOverlay:overlay};
const events=[];
const document={
  body:{style:{}},
  head:{appendChild(){}},
  documentElement:{},
  getElementById(id){return elements[id]||null;},
  createElement(){return{id:'',textContent:'',style:{}};},
  dispatchEvent(event){events.push(event);return true;},
};
class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail||{};}}
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const pending=new Map();
function mockFetch(_url,init={}){
  const body=JSON.parse(String(init.body||'{}'));
  const key=body.id||body.repairId||body.op;
  return new Promise((resolve,reject)=>{
    const abort=()=>{const error=new Error('aborted');error.name='AbortError';reject(error);};
    if(init.signal?.aborted)return abort();
    init.signal?.addEventListener?.('abort',abort,{once:true});
    pending.set(key,{resolve:data=>resolve({ok:true,status:200,json:async()=>data}),reject});
  });
}

const context={
  console,AbortController,Map,Set,Promise,JSON,String,Number,Error,
  document,CustomEvent,localStorage,fetch:mockFetch,
  requestAnimationFrame:fn=>setImmediate(fn),setTimeout,clearTimeout,
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('crm-order-controller.js','utf8'),context,{filename:'crm-order-controller.js'});
const controller=context.MAOrderController;
assert(controller,'OrderController should load');

const renders=[];
controller.registerRenderer(data=>{renders.push(data.repair.id);bodyEl.rendered=true;bodyEl.innerHTML='<div class="order-layout"></div>';});

(async()=>{
  const a=controller.open('A');
  const b=controller.open('B');
  assert(pending.has('B'),'B request should be active');
  pending.get('B').resolve({ok:true,repair:{id:'B',order_no:2}});
  await b;await a;await tick();await tick();
  assert.deepStrictEqual(renders,['B'],'stale A response must never render after B');
  assert.strictEqual(controller.repairId,'B','B remains current');
  assert.strictEqual(events.filter(e=>e.type==='ma:order:ready').length,1,'one ready event for the active token');

  bodyEl.rendered=false;
  const c=controller.open('C');
  assert(pending.has('C'),'C request should start');
  controller.close();
  await c;await tick();
  assert.deepStrictEqual(renders,['B'],'closing during load prevents a late C render');
  assert.strictEqual(controller.repairId,'','close clears current order');
  assert(overlay.classList.contains('hidden'),'close hides order overlay');

  bodyEl.rendered=false;
  const d=controller.open('D');
  pending.get('D').resolve({ok:true,repair:{id:'D',order_no:4}});
  await d;await tick();await tick();
  assert.strictEqual(renders.at(-1),'D','order can reopen normally after close');

  let calls=0;
  controller.registerSection('race',({signal})=>new Promise((resolve,reject)=>{
    calls++;
    const call=calls;
    const abort=()=>{const e=new Error('aborted');e.name='AbortError';reject(e);};
    if(signal.aborted)return abort();
    signal.addEventListener('abort',abort,{once:true});
    setTimeout(()=>resolve({call}),call===1?30:2);
  }));
  const first=controller.refreshSection('race',{force:true});
  const second=controller.refreshSection('race',{force:true});
  const [one,two]=await Promise.all([first,second]);
  assert.strictEqual(one,null,'superseded section request resolves as stale/null');
  assert.deepStrictEqual(two,{call:2},'latest section request wins');
  assert.deepStrictEqual(controller.getSection('race'),{call:2},'section cache stores only latest data');

  console.log('CRM OrderController behavioral tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
