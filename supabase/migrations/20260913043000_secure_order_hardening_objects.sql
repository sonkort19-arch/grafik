alter table public.ma_crm_service_categories enable row level security;
alter table public.ma_crm_service_catalog enable row level security;
alter table public.ma_crm_service_compensation_rules enable row level security;
alter table public.ma_crm_order_events enable row level security;
alter table public.ma_crm_payroll_entries enable row level security;
alter table public.ma_crm_status_definitions enable row level security;
alter table public.ma_crm_document_templates enable row level security;

revoke all on table public.ma_crm_service_categories from anon, authenticated;
revoke all on table public.ma_crm_service_catalog from anon, authenticated;
revoke all on table public.ma_crm_service_compensation_rules from anon, authenticated;
revoke all on table public.ma_crm_order_events from anon, authenticated;
revoke all on table public.ma_crm_payroll_entries from anon, authenticated;
revoke all on table public.ma_crm_status_definitions from anon, authenticated;
revoke all on table public.ma_crm_document_templates from anon, authenticated;

revoke all on function public.ma_crm_event_after_repair_insert() from public, anon, authenticated;
revoke all on function public.ma_crm_event_after_payment_insert() from public, anon, authenticated;
revoke all on function public.ma_crm_event_after_file_insert() from public, anon, authenticated;
