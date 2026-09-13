-- An issued order has already produced payment/history/payroll side effects.
-- Reopening it with a plain status change would leave those side effects in place,
-- so closed orders must go through an explicit refund/warranty workflow instead.

create or replace function public.ma_crm_set_repair_status(
  p_repair_id uuid,
  p_status text,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_now timestamptz := now();
begin
  if p_repair_id is null then raise exception 'Не указан заказ'; end if;
  if not exists(
    select 1 from public.ma_crm_status_definitions
    where code = p_status and active = true
  ) then
    raise exception 'Неверный статус';
  end if;
  if p_status = 'issued' then
    raise exception 'Статус «Выдан» меняется только через выдачу заказа';
  end if;

  select * into v_repair
  from public.ma_crm_repairs
  where id = p_repair_id
  for update;

  if v_repair.id is null then raise exception 'Заказ не найден'; end if;
  if v_repair.status = p_status then
    return jsonb_build_object('unchanged', true, 'repair', to_jsonb(v_repair));
  end if;

  if v_repair.status = 'issued' then
    raise exception 'Выданный заказ нельзя вернуть в работу простой сменой статуса. Используй возврат или гарантийное обращение';
  end if;

  update public.ma_crm_repairs
  set status = p_status,
      ready_at = case when p_status = 'ready' then v_now else null end,
      issued_at = null,
      updated_by = left(coalesce(p_actor, ''), 100),
      updated_at = v_now
  where id = v_repair.id;

  insert into public.ma_crm_repair_status_history(
    repair_id, old_status, new_status, changed_by
  ) values (
    v_repair.id, v_repair.status, p_status, left(coalesce(p_actor, ''), 100)
  );

  perform public.ma_crm_log_order_event(
    v_repair.id,
    'status_changed',
    p_actor,
    jsonb_build_object('status', v_repair.status),
    jsonb_build_object('status', p_status),
    '',
    null
  );

  return jsonb_build_object(
    'unchanged', false,
    'oldStatus', v_repair.status,
    'newStatus', p_status
  );
end;
$$;

revoke all on function public.ma_crm_set_repair_status(uuid,text,text) from public, anon, authenticated;
grant execute on function public.ma_crm_set_repair_status(uuid,text,text) to service_role;
