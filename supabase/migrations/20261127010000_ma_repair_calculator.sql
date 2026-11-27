-- The calculator document contains internal pricing rules. Only the staff API reads it.
create table public.ma_repair_calculator (
  id smallint primary key check (id = 1),
  html text not null check (length(html) > 0)
);
alter table public.ma_repair_calculator enable row level security;
revoke all on public.ma_repair_calculator from public, anon, authenticated;
grant select on public.ma_repair_calculator to service_role;
