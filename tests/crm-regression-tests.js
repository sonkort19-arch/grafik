const fs=require('fs');
const assert=require('assert');

const read=p=>fs.readFileSync(p,'utf8');
const finalJs=read('crm-final.js');
const finalCss=read('crm-final.css');
const phaseApi=read('supabase/functions/ma-crm-phase1-api/index.ts');
const migration=read('supabase/migrations/20260911163000_add_ma_crm_atomic_repair_create.sql');

assert(finalJs.includes('create-repair-bundle'),'new repair must use atomic bundle API');
assert(!finalJs.includes('location.reload()'),'CRM actions must not force a full page reload');
assert(!finalJs.includes('block:"center"'),'mobile focus must not force fields to screen center');
assert(finalJs.includes('block:"nearest"'),'mobile focus correction should use nearest scrolling');
assert(finalJs.includes('assign-sale-default'),'manager sales must receive a default cashbox');
assert(phaseApi.includes('cashbox_id:cashboxId'),'repair payments must be assigned to a matching cashbox');
assert(phaseApi.includes('createRepairBundle'),'phase API must expose atomic repair creation');
assert(phaseApi.includes('assignSaleDefault'),'phase API must assign manager sales to cashboxes');
assert(migration.includes('revoke all on function public.ma_crm_create_repair_bundle'),'atomic RPC must not be public');
assert(migration.includes('grant execute on function public.ma_crm_create_repair_bundle')&&migration.includes('to service_role'),'atomic RPC must be service-role only');
assert(/font-size:16px!important/.test(finalCss),'mobile CRM controls must stay at least 16px to avoid iOS auto zoom');
assert(!finalCss.includes('scroll-padding-bottom:calc(110px + var(--crm-keyboard-offset'),'keyboard height must not be double-counted in drawer scrolling');

console.log('CRM regression checks: OK');
