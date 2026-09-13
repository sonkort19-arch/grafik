-- Financial integrity guards found by ORDER DESTROYER QA.
-- Prevent overpayment, over-refund, post-issue payments and cross-order idempotency collisions.

create or replace function public.ma_crm_add_order_payment(
  p_repair_id uuid,
  p_kind text,
  p_method text,
  p_category text,
  p_amount numeric,
  p_note text,
  p_actor text,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_cashbox_id uuid;
  v_payment public.ma_crm_payments%rowtype;
  v_existing public.ma_crm_payments%rowtype;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_item_count integer := 0;
  v_order_total numeric := 0;
  v_net_paid numeric := 0;
  v_remaining numeric := 0;
  v_refundable numeric := 0;
begin
  if p_repair_id is null then raise exception 'Не указан заказ'; end if;
  if p_kind not in ('payment','refund') then raise exception 'Неверный тип платежа'; end if;
  if p_method not in ('cash','card','transfer','other') then raise exception 'Неверный способ оплаты'; end if;
  if p_category not in ('deposit','payment','additional','final','refund','deposit_refund') then raise exception 'Неверная категория платежа'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception 'Неверная сумма оплаты'; end if;

  if p_kind = 'payment' and p_category in ('refund','deposit_refund') then
    raise exception 'Категория возврата не подходит для оплаты';
  end if;
  if p_kind = 'refund' and p_category not in ('refund','deposit_refund') then
    raise exception 'Для возврата выбери категорию возврата';
  end if;

  if v_key is not null then
    select * into v_existing
    from public.ma_crm_payments
    where idempotency_key = v_key
    limit 1;

    if v_existing.id is not null then
      if v_existing.repair_id is distinct from p_repair_id then
        raise exception 'Ключ операции уже используется другим заказом';
      end if;
      return jsonb_build_object('payment', to_jsonb(v_existing), 'duplicate', true);
    end if;
  end if;

  select * into v_repair
  from public.ma_crm_repairs
  where id = p_repair_id
  for update;

  if v_repair.id is null then raise exception 'Заказ не найден'; end if;

  select count(*), round(coalesce(sum(quantity * unit_price - discount_amount), 0)::numeric, 2)
  into v_item_count, v_order_total
  from public.ma_crm_repair_items
  where repair_id = p_repair_id;

  if v_item_count = 0 then
    v_order_total := round(coalesce(v_repair.final_price, v_repair.estimated_price, 0)::numeric, 2);
  end if;

  select round(coalesce(sum(case when kind = 'refund' then -amount else amount end), 0)::numeric, 2)
  into v_net_paid
  from public.ma_crm_payments
  where repair_id = p_repair_id;

  if p_kind = 'payment' then
    if v_repair.status = 'issued' then
      raise exception 'Заказ уже выдан. Новую оплату добавить нельзя';
    end if;

    v_remaining := greatest(round((v_order_total - v_net_paid)::numeric, 2), 0);

    -- A deposit is allowed when the order price is still unknown (0 ₽).
    if not (p_category = 'deposit' and v_order_total <= 0.009) then
      if v_remaining <= 0.009 then
        raise exception 'Заказ уже полностью оплачен';
      end if;
      if p_amount - v_remaining > 0.009 then
        raise exception 'Сумма оплаты больше остатка % ₽', trim(to_char(v_remaining, 'FM999999990.00'));
      end if;
    end if;
  else
    v_refundable := greatest(v_net_paid, 0);
    if v_refundable <= 0.009 then
      raise exception 'По заказу нечего возвращать';
    end if;
    if p_amount - v_refundable > 0.009 then
      raise exception 'Сумма возврата больше оплаченной суммы % ₽', trim(to_char(v_refundable, 'FM999999990.00'));
    end if;
  end if;

  select id into v_cashbox_id
  from public.ma_crm_cashboxes
  where active = true
    and service = v_repair.service
    and kind = p_method
  order by created_at asc
  limit 1;

  if v_cashbox_id is null then
    raise exception 'Для этой точки не настроена касса выбранного типа';
  end if;

  insert into public.ma_crm_payments(
    repair_id, kind, method, category, amount, note,
    created_by, cashbox_id, customer_id, idempotency_key
  ) values (
    v_repair.id, p_kind, p_method, p_category, p_amount,
    left(coalesce(p_note, ''), 500),
    left(coalesce(p_actor, ''), 100),
    v_cashbox_id, v_repair.customer_id, v_key
  )
  returning * into v_payment;

  perform public.ma_crm_log_order_event(
    v_repair.id,
    case when p_kind = 'refund' then 'payment_refund' else 'payment_added' end,
    p_actor,
    null,
    to_jsonb(v_payment),
    coalesce(p_note, ''),
    'payment:' || v_payment.id::text
  );

  return jsonb_build_object('payment', to_jsonb(v_payment), 'duplicate', false);
end;
$$;

revoke all on function public.ma_crm_add_order_payment(uuid,text,text,text,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.ma_crm_add_order_payment(uuid,text,text,text,numeric,text,text,text) to service_role;
