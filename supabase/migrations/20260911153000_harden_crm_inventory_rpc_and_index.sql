alter function public.ma_crm_guard_inventory_repair_item_update() set search_path = public, pg_temp;

revoke execute on function public.ma_crm_inventory_receive(uuid,text,numeric,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.ma_crm_inventory_writeoff(uuid,text,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.ma_crm_inventory_transfer(uuid,text,text,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.ma_crm_inventory_use_for_repair(uuid,uuid,numeric,numeric,text) from public, anon, authenticated;
revoke execute on function public.ma_crm_restore_stock_on_repair_item_delete() from public, anon, authenticated;
revoke execute on function public.ma_crm_guard_inventory_repair_item_update() from public, anon, authenticated;

grant execute on function public.ma_crm_inventory_receive(uuid,text,numeric,numeric,text,text) to service_role;
grant execute on function public.ma_crm_inventory_writeoff(uuid,text,numeric,text,text) to service_role;
grant execute on function public.ma_crm_inventory_transfer(uuid,text,text,numeric,text,text) to service_role;
grant execute on function public.ma_crm_inventory_use_for_repair(uuid,uuid,numeric,numeric,text) to service_role;

create index if not exists ma_crm_inventory_movements_repair_item_idx
  on public.ma_crm_inventory_movements(repair_item_id);
