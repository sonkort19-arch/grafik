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
set search_path=public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_cashbox_id uuid;
  v_payment public.ma_crm_payments%rowtype;
  v_existing public.ma_crm_payments%rowtype;
  v_key text:=nullif(btrim(coalesce(p_idempotency_key,'')),'');
begin
  if p_repair_id is null then raise exception 'Не указан заказ'; end if;
  if p_kind not in ('payment','refund') then raise exception 'Неверный тип платежа'; end if;
  if p_method not in ('cash','card','transfer','other') then raise exception 'Неверный способ оплаты'; end if;
  if p_category not in ('deposit','payment','additional','final','refund','deposit_refund') then raise exception 'Неверная категория платежа'; end if;
  if p_amount is null or p_amount<=0 or p_amount>100000000 then raise exception 'Неверная сумма оплаты'; end if;

  if v_key is not null then
    select * into v_existing from public.ma_crm_payments where idempotency_key=v_key limit 1;
    if v_existing.id is not null then return jsonb_build_object('payment',to_jsonb(v_existing),'duplicate',true); end if;
  end if;

  select * into v_repair from public.ma_crm_repairs where id=p_repair_id for update;
  if v_repair.id is null then raise exception 'Заказ не найден'; end if;
  select id into v_cashbox_id from public.ma_crm_cashboxes
  where active=true and service=v_repair.service and kind=p_method
  order by created_at asc limit 1;
  if v_cashbox_id is null then raise exception 'Для этой точки не настроена касса выбранного типа'; end if;

  insert into public.ma_crm_payments(repair_id,kind,method,category,amount,note,created_by,cashbox_id,customer_id,idempotency_key)
  values(v_repair.id,p_kind,p_method,p_category,p_amount,left(coalesce(p_note,''),500),left(coalesce(p_actor,''),100),v_cashbox_id,v_repair.customer_id,v_key)
  returning * into v_payment;

  perform public.ma_crm_log_order_event(v_repair.id,case when p_kind='refund' then 'payment_refund' else 'payment_added' end,p_actor,null,to_jsonb(v_payment),coalesce(p_note,''),'payment:'||v_payment.id::text);
  return jsonb_build_object('payment',to_jsonb(v_payment),'duplicate',false);
end;
$$;
revoke all on function public.ma_crm_add_order_payment(uuid,text,text,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.ma_crm_add_order_payment(uuid,text,text,text,numeric,text,text,text) to service_role;
