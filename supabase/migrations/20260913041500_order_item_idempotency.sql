alter table public.ma_crm_repair_items
  add column if not exists idempotency_key text;

create unique index if not exists ma_crm_repair_items_idempotency_uidx
  on public.ma_crm_repair_items(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key)<>'';
