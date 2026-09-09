alter table public.ma_grafik_api_audit enable row level security;

revoke all on table public.ma_grafik_api_audit from anon, authenticated;
grant all on table public.ma_grafik_api_audit to service_role;

do $$
begin
  if to_regclass('public.ma_grafik_api_audit_id_seq') is not null then
    execute 'revoke all on sequence public.ma_grafik_api_audit_id_seq from anon, authenticated';
    execute 'grant all on sequence public.ma_grafik_api_audit_id_seq to service_role';
  end if;
end $$;
