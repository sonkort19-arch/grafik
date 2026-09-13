-- Closed/issued order economics are already reflected in payments and payroll.
-- Block item mutations after issue so price/cost/profit cannot drift behind those snapshots.

create or replace function public.ma_crm_guard_issued_repair_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_repair_id uuid;
  v_status text;
begin
  v_repair_id := case when tg_op = 'INSERT' then new.repair_id else old.repair_id end;
  select status into v_status
  from public.ma_crm_repairs
  where id = v_repair_id;

  if v_status = 'issued' then
    raise exception 'Выданный заказ закрыт. Товары и услуги нельзя изменять; используй возврат или гарантийное обращение';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ma_crm_guard_issued_repair_item_mutation() from public, anon, authenticated;

drop trigger if exists ma_crm_guard_issued_repair_item_mutation_trg on public.ma_crm_repair_items;
create trigger ma_crm_guard_issued_repair_item_mutation_trg
before insert or update or delete on public.ma_crm_repair_items
for each row execute function public.ma_crm_guard_issued_repair_item_mutation();
