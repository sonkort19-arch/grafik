create index if not exists ma_crm_payments_customer_idx
  on public.ma_crm_payments(customer_id)
  where customer_id is not null;

create index if not exists ma_crm_payroll_entries_repair_item_idx
  on public.ma_crm_payroll_entries(repair_item_id)
  where repair_item_id is not null;

create index if not exists ma_crm_repair_items_service_catalog_idx
  on public.ma_crm_repair_items(service_catalog_id)
  where service_catalog_id is not null;
