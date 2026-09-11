const fs=require('fs');
const assert=require('assert');

const read=p=>fs.readFileSync(p,'utf8');
const finalJs=read('crm-final.js');
const finalCss=read('crm-final.css');
const baseApi=read('supabase/functions/ma-crm-api/index.ts');
const phaseApi=read('supabase/functions/ma-crm-phase1-api/index.ts');
const finalApi=read('supabase/functions/ma-crm-final-api/index.ts');
const repairMigration=read('supabase/migrations/20260911163000_add_ma_crm_atomic_repair_create.sql');
const cashflowMigration=read('supabase/migrations/20260911165500_harden_ma_crm_atomic_cashflows.sql');

assert(finalJs.includes('create-repair-bundle'),'new repair must use atomic bundle API');
assert(finalJs.includes('create-sale-bundle'),'new sale must use atomic bundle API');
assert(finalJs.includes('createSaleAtomic'),'sale interception must be atomic');
assert(!finalJs.includes('location.reload()'),'CRM actions must not force a full page reload');
assert(!finalJs.includes('block:"center"'),'mobile focus must not force fields to screen center');
assert(finalJs.includes('block:"nearest"'),'mobile focus correction should use nearest scrolling');
assert(phaseApi.includes('cashbox_id:cashboxId'),'repair payments must be assigned to a matching cashbox');
assert(phaseApi.includes('createRepairBundle'),'phase API must expose atomic repair creation');
assert(phaseApi.includes('createSaleBundle'),'phase API must expose atomic sale creation');
assert(repairMigration.includes('revoke all on function public.ma_crm_create_repair_bundle'),'repair RPC must not be public');
assert(cashflowMigration.includes('grant execute on function public.ma_crm_create_repair_bundle')&&cashflowMigration.includes('to service_role'),'repair RPC must stay service-role only');
assert(cashflowMigration.includes('revoke all on function public.ma_crm_create_sale_bundle'),'sale RPC must not be public');
assert(cashflowMigration.includes('grant execute on function public.ma_crm_create_sale_bundle')&&cashflowMigration.includes('to service_role'),'sale RPC must be service-role only');
assert(cashflowMigration.includes('Для этой точки не настроена касса выбранного типа'),'cashflows must fail rather than remain unassigned');
assert(/font-size:16px!important/.test(finalCss),'mobile CRM controls must stay at least 16px to avoid iOS auto zoom');
assert(!finalCss.includes('scroll-padding-bottom:calc(110px + var(--crm-keyboard-offset'),'keyboard height must not be double-counted in drawer scrolling');
assert(baseApi.includes('select("status,ready_at,issued_at")'),'status changes must read lifecycle timestamps');
assert(baseApi.includes('patch.ready_at=null;patch.issued_at=null'),'reopening a repair must clear stale ready/issued timestamps');
assert(finalApi.includes('if(new Date(until)<new Date())throw new Error("Срок гарантии закончился")'),'expired warranty must be blocked for every role');
assert(finalApi.includes('T00:00:00+03:00'),'payroll month boundaries must use Moscow local midnight');

console.log('CRM regression checks: OK');
