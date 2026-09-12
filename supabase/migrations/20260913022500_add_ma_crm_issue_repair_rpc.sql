create or replace function public.ma_crm_issue_repair(
  p_repair_id uuid,
  p_method text,
  p_amount numeric,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_cashbox_id uuid;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_payment_id uuid;
  v_kind text;
  v_now timestamptz := now();
begin
  if p_repair_id is null then raise exception 'Не указан заказ'; end if;
  if p_method not in ('cash','card','transfer','other') then raise exception 'Неверный способ оплаты'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000 then raise exception 'Неверная сумма оплаты'; end if;

  select * into v_repair
  from public.ma_crm_repairs
  where id = p_repair_id
  for update;

  if v_repair.id is null then raise exception 'Заказ не найден'; end if;
  if v_repair.status = 'issued' then
    return jsonb_build_object('unchanged',true,'repair_id',v_repair.id,'status','issued');
  end if;

  v_total := coalesce(v_repair.final_price, v_repair.estimated_price, 0);
  select coalesce(sum(case when kind='refund' then -amount else amount end),0)
    into v_paid
  from public.ma_crm_payments
  where repair_id = p_repair_id;

  v_remaining := greatest(v_total - v_paid, 0);

  if v_remaining > 0.009 and abs(p_amount - v_remaining) > 0.009 then
    raise exception 'Для выдачи нужно оплатить остаток % ₽', trim(to_char(v_remaining,'FM999999990.00'));
  end if;
  if v_remaining <= 0.009 and p_amount > 0.009 then
    raise exception 'Заказ уже полностью оплачен';
  end if;

  if p_amount > 0.009 then
    v_kind := case p_method when 'card' then 'card' when 'transfer' then 'transfer' when 'other' then 'other' else 'cash' end;
    select id into v_cashbox_id
    from public.ma_crm_cashboxes
    where active = true and service = v_repair.service and kind = v_kind
    order by name
    limit 1;

    insert into public.ma_crm_payments(repair_id,kind,method,amount,note,created_by,cashbox_id)
    values(p_repair_id,'payment',p_method,p_amount,'Оплата при выдаче',coalesce(p_actor,''),v_cashbox_id)
    returning id into v_payment_id;
  end if;

  update public.ma_crm_repairs
  set status='issued',
      ready_at=coalesce(ready_at,v_now),
      issued_at=v_now,
      updated_by=coalesce(p_actor,''),
      updated_at=v_now
  where id=p_repair_id;

  insert into public.ma_crm_repair_status_history(repair_id,old_status,new_status,changed_by)
  values(p_repair_id,v_repair.status,'issued',coalesce(p_actor,''));

  return jsonb_build_object(
    'repair_id',p_repair_id,
    'status','issued',
    'payment_id',v_payment_id,
    'amount',p_amount,
    'total',v_total,
    'paid_before',v_paid,
    'paid_after',v_paid+p_amount,
    'cashbox_id',v_cashbox_id
  );
end;
$$;

revoke all on function public.ma_crm_issue_repair(uuid,text,numeric,text) from public;
revoke all on function public.ma_crm_issue_repair(uuid,text,numeric,text) from anon;
revoke all on function public.ma_crm_issue_repair(uuid,text,numeric,text) from authenticated;
grant execute on function public.ma_crm_issue_repair(uuid,text,numeric,text) to service_role;
