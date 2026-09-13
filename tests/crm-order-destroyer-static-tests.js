const fs = require('fs');
const assert = require('assert');

const read = path => fs.readFileSync(path, 'utf8');
const controller = read('crm-order-controller.js');
const issue = read('crm-issue.js');
const mobile = read('crm-mobile-audit.js');
const orderApi = read('supabase/functions/ma-crm-order-api/index.ts');
const payrollFix = read('supabase/migrations/20260913104500_fix_payroll_snapshot_unassigned_record.sql');
const paymentGuard = read('supabase/migrations/20260913110500_guard_order_payment_balance.sql');

function must(source, pattern, message) {
  assert(pattern.test(source), message);
}
function mustNot(source, pattern, message) {
  assert(!pattern.test(source), message);
}

must(controller, /new AbortController\(\)/, 'OrderController must cancel stale requests');
must(controller, /token!==state\.token/, 'OrderController must reject stale order responses');
must(controller, /status===401\|\|status===403/, '401 and 403 must both expire CRM auth');
mustNot(controller, /location\.reload\s*\(/, 'OrderController must not reload the CRM');

must(issue, /if\(submit\.disabled\)return/, 'Issue submit must guard double actions');
must(issue, /submit\.disabled=true/, 'Issue submit must lock while server transaction is running');
must(issue, /issue-repair/, 'Issue flow must use the atomic issue-repair server operation');
mustNot(issue, /location\.reload\s*\(/, 'Issue flow must not reload the CRM');

must(mobile, /touchend/, 'iPhone menu must have a real touch path');
must(mobile, /repairOrphanedScrollLock/, 'Mobile shell must repair orphaned scroll locks');

must(orderApi, /idempotencyKey/, 'Order API must support idempotency keys');
must(orderApi, /ma_crm_add_order_payment/, 'Payments must go through atomic payment RPC');
must(orderApi, /discount>quantity\*unitPrice/, 'Discount must be bounded by position revenue');
must(orderApi, /positive\(body\.quantity,10000\)/, 'Order quantity must be positive and bounded');

must(payrollFix, /v_rule_id uuid/, 'Payroll fix must use scalar rule id');
must(payrollFix, /v_comp_percent numeric/, 'Payroll fix must use scalar compensation percent');
mustNot(payrollFix, /v_rule\s+record/, 'Payroll snapshot must not reintroduce unassigned RECORD rule variables');
mustNot(payrollFix, /v_comp\s+record/, 'Payroll snapshot must not reintroduce unassigned RECORD compensation variables');
must(payrollFix, /coalesce\(v_comp_percent, 0\)/, 'Missing compensation must safely fall back to 0%');

must(paymentGuard, /v_existing\.repair_id is distinct from p_repair_id/, 'Idempotency keys must not cross order boundaries');
must(paymentGuard, /v_repair\.status = 'issued'/, 'Issued orders must reject new manual payments');
must(paymentGuard, /p_amount - v_remaining > 0\.009/, 'Payments must not exceed the remaining balance');
must(paymentGuard, /p_amount - v_refundable > 0\.009/, 'Refunds must not exceed money actually paid');
must(paymentGuard, /p_kind = 'refund' and p_category not in \('refund','deposit_refund'\)/, 'Refund kind/category must stay consistent');

console.log('CRM order destroyer static guards: OK');
