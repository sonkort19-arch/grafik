"use strict";
const fs=require("fs"),assert=require("assert");
const page=fs.readFileSync("index.html","utf8");
const client=fs.readFileSync("marketing.js","utf8");
const server=fs.readFileSync("supabase/functions/ma-marketer/index.ts","utf8");
const sql=fs.readFileSync("supabase/migrations/20261012190000_marketer_account.sql","utf8");
for(const id of ["marketingModal","marketingOpenBtn","marketingLogin","marketingPassword","marketingReportsList","marketingOwnerSetup"])
  assert(page.includes('id="'+id+'"'),id);
assert(page.includes("marketing.js?v="));
assert(client.includes("sessionStorage.setItem(STORAGE"));
assert(!/3578/.test(page+client+server+sql),"Credentials must not ship in source");
assert(server.includes("await assertOwner(req)"),"Owner must create credentials");
assert(server.includes("authenticate(req)"),"Reports require authenticated role");
assert(server.includes("ma_shift_daily_reports"),"Reports must be retrieved");
assert(sql.includes("ENABLE ROW LEVEL SECURITY"));
assert(!server.includes('from("ma_wallet_'),"No access to wallets");
console.log("PASS: marketer login is separate from owner and can read reports.");
