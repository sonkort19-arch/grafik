const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Check the access branch actually used by the deployed operation, with isolated staff and device fixtures.
const source = fs.readFileSync("supabase/functions/ma-shifts/index.ts","utf8");
const start = source.indexOf("async function handleRepairCalculator(");
const end = source.indexOf("\nasync function ",start+1);
assert(start>=0 && end>start);
const handler = source.slice(start,end).replace("req:Request,body:any","req,body");
let reads=0;
const checker = (ok) => { if (!ok) throw new Error("denied"); };
const admin = {from(name) {
  assert.equal(name,"ma_repair_calculator");reads++;
  return {select:field=>({eq:(key,value)=>({async single() {
    assert.deepEqual([field,key,value],["html","id",1]);
    return {data:{html:"<body>fixture</body>"}};
  }})})};
}};
const ctx = {
  admin, Response, corsHeaders:{}, configuredEmployeeNames:async()=>new Set(["staff"]),
  loadScheduleSettings:async()=>({}), assertAdmin:async req=>checker(req.admin),
  verifyEmployeeSubscriptionPin:async(name,pin)=>checker(name==="staff" && pin==="1234"),
  verifyShiftDevice:async(service,token,proof,action,employee)=>checker(
    service==="point" && token==="paired" && proof?.valid && action==="repair-calculator" && employee===""
  )
};
vm.createContext(ctx);vm.runInContext(handler,ctx);
(async()=>{
  for (const [req,body] of [[{},{}],[{},{employee:"former",pin:"1234"}],[{},{employee:"staff",pin:"4321"}],[{},{deviceToken:"paired",service:"point"}]]) {
    await assert.rejects(ctx.handleRepairCalculator(req,body));
  }
  assert.equal(reads,0);
  for (const [req,body] of [[{admin:true},{}],[{},{employee:"staff",pin:"1234"}],[{},{deviceToken:"paired",service:"point",deviceProof:{valid:true}}]]) {
    const resp=await ctx.handleRepairCalculator(req,body);
    assert.equal(resp.headers.get("Cache-Control"),"no-store");
    assert.equal((await resp.json()).html,"<body>fixture</body>");
  }
  assert.equal(reads,3);console.log("Repair calculator staff access checks passed");
})().catch(e=>{console.error(e);process.exitCode=1;});
