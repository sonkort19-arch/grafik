alter table public.ma_grafik_api_audit
  add column if not exists status text not null default 'applied',
  add column if not exists error_text text;

alter table public.ma_grafik_api_audit
  drop constraint if exists ma_grafik_api_audit_status_check;

alter table public.ma_grafik_api_audit
  add constraint ma_grafik_api_audit_status_check
  check (status in ('pending', 'applied', 'conflict', 'error'));
