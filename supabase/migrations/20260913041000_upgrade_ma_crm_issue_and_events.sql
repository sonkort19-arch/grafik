-- Complete the order lifecycle after the additive hardening schema exists.

create unique index if not exists ma_crm_order_events_source_uidx
  on public.ma_crm_order_events(repair_id,source_id)
  where source_id is not null and btrim(source_id)<>'';

insert into public.ma_crm_order_events(repair_id,event_type,employee,old_value,new_value,description,source_id,created_at)
select r.id,'order_created',coalesce(r.created_by,''),null,jsonb_build_object('orderNo',r.order_no,'status',r.status),'Заказ создан','repair:'||r.id::text,r.accepted_at
from public.ma_crm_repairs r
on conflict do nothing;

insert into public.ma_crm_order_events(repair_id,event_type,employee,old_value,new_value,description,source_id,created_at)
select h.repair_id,'status_changed',coalesce(h.changed_by,''),case when h.old_status is null then null else jsonb_build_object('status',h.old_status) end,jsonb_build_object('status',h.new_status),'','status-history:'||h.id::text,h.created_at
from public.ma_crm_repair_status_history h
on conflict do nothing;

insert into public.ma_crm_order_events(repair_id,event_type,employee,old_value,new_value,description,source_id,created_at)
select p.repair_id,case when p.kind='refund' then 'payment_refund' else 'payment_added' end,coalesce(p.created_by,''),null,jsonb_build_object('id',p.id,'kind',p.kind,'method',p.method,'category',p.category,'amount',p.amount,'cashboxId',p.cashbox_id),coalesce(p.note,''),'payment:'||p.id::text,p.created_at
from public.ma_crm_payments p
on conflict do nothing;

create or replace function public.ma_crm_issue_repair(
  p_repair_id uuid,
  p_method text,
  p_amount numeric,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_cashbox_id uuid;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_payment_id uuid;
  v_now timestamptz := now();
  v_item_count integer := 0;
  v_payroll jsonb;
begin
  if p_repair_id is null then raise exception 'Не указан заказ'; end if;
  if p_method not in ('cash','card','transfer','other') then raise exception 'Неверный способ оплаты'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000 then raise exception 'Неверная сумма оплаты'; end if;

  select * into v_repair from public.ma_crm_repairs where id=p_repair_id for update;
  if v_repair.id is null then raise exception 'Заказ не найден'; end if;

  if v_repair.status='issued' then
    return jsonb_build_object('unchanged',true,'repair_id',v_repair.id,'status','issued');
  end if;

  select count(*),round(coalesce(sum(quantity*unit_price-discount_amount),0)::numeric,2)
  into v_item_count,v_total
  from public.ma_crm_repair_items
  where repair_id=p_repair_id;
  if v_item_count=0 then v_total:=coalesce(v_repair.final_price,v_repair.estimated_price,0); end if;

  select round(coalesce(sum(case when kind='refund' then -amount else amount end),0)::numeric,2)
  into v_paid from public.ma_crm_payments where repair_id=p_repair_id;
  v_remaining:=greatest(round((v_total-v_paid)::numeric,2),0);

  if v_remaining>0.009 and abs(p_amount-v_remaining)>0.009 then
    raise exception 'Для выдачи нужно оплатить остаток % ₽',trim(to_char(v_remaining,'FM999999990.00'));
  end if;
  if v_remaining<=0.009 and p_amount>0.009 then raise exception 'Заказ уже полностью оплачен'; end if;

  if p_amount>0.009 then
    select id into v_cashbox_id from public.ma_crm_cashboxes
    where active=true and service=v_repair.service and kind=p_method
    order by created_at asc limit 1;
    if v_cashbox_id is null then raise exception 'Для этой точки не настроена касса выбранного типа'; end if;

    insert into public.ma_crm_payments(repair_id,kind,method,category,amount,note,created_by,cashbox_id,customer_id,idempotency_key)
    values(p_repair_id,'payment',p_method,'final',p_amount,'Оплата при выдаче',left(coalesce(p_actor,''),100),v_cashbox_id,v_repair.customer_id,'issue:'||p_repair_id::text)
    returning id into v_payment_id;

    perform public.ma_crm_log_order_event(p_repair_id,'payment_added',p_actor,null,jsonb_build_object('id',v_payment_id,'kind','payment','method',p_method,'category','final','amount',p_amount,'cashboxId',v_cashbox_id),'Оплата при выдаче','payment:'||v_payment_id::text);
  end if;

  update public.ma_crm_repairs
  set status='issued',final_price=case when v_item_count>0 then v_total else final_price end,ready_at=coalesce(ready_at,v_now),issued_at=v_now,updated_by=left(coalesce(p_actor,''),100),updated_at=v_now
  where id=p_repair_id;

  insert into public.ma_crm_repair_status_history(repair_id,old_status,new_status,changed_by)
  values(p_repair_id,v_repair.status,'issued',left(coalesce(p_actor,''),100));
  perform public.ma_crm_log_order_event(p_repair_id,'status_changed',p_actor,jsonb_build_object('status',v_repair.status),jsonb_build_object('status','issued'),'Заказ выдан',null);
  perform public.ma_crm_log_order_event(p_repair_id,'order_issued',p_actor,null,jsonb_build_object('total',v_total,'paidBefore',v_paid,'paidNow',p_amount,'paymentId',v_payment_id),'Заказ выдан клиенту',null);

  v_payroll:=public.ma_crm_snapshot_repair_payroll(p_repair_id,p_actor);

  return jsonb_build_object(
    'repair_id',p_repair_id,
    'status','issued',
    'payment_id',v_payment_id,
    'amount',p_amount,
    'total',v_total,
    'paid_before',v_paid,
    'paid_after',v_paid+p_amount,
    'cashbox_id',v_cashbox_id,
    'payroll',v_payroll
  );
end;
$$;

revoke all on function public.ma_crm_issue_repair(uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.ma_crm_issue_repair(uuid,text,numeric,text) to service_role;
