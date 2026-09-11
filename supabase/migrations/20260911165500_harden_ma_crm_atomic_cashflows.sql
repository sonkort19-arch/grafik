create or replace function public.ma_crm_create_repair_bundle(
  p_customer_name text,
  p_phone text,
  p_phone_normalized text,
  p_service text,
  p_device text,
  p_model text,
  p_imei text,
  p_issue text,
  p_estimated_price numeric,
  p_manager text,
  p_master text,
  p_comment text,
  p_due_at timestamptz,
  p_warranty_days integer,
  p_warranty_note text,
  p_initial_payment numeric,
  p_initial_method text,
  p_actor text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_repair_id uuid;
  v_cashbox_id uuid;
  v_method text := coalesce(nullif(trim(p_initial_method), ''), 'cash');
begin
  if p_phone_normalized is null or length(trim(p_phone_normalized)) < 10 then raise exception 'Проверь номер телефона'; end if;
  if p_service is null or trim(p_service) = '' then raise exception 'Выбери точку'; end if;
  if p_issue is null or trim(p_issue) = '' then raise exception 'Укажи неисправность'; end if;
  if coalesce(p_estimated_price,0) < 0 or coalesce(p_estimated_price,0) > 100000000 then raise exception 'Неверная сумма'; end if;
  if coalesce(p_warranty_days,14) < 0 or coalesce(p_warranty_days,14) > 730 then raise exception 'Гарантия должна быть от 0 до 730 дней'; end if;
  if v_method not in ('cash','card','transfer','other') then raise exception 'Неверный способ оплаты'; end if;
  if coalesce(p_initial_payment,0) < 0 or coalesce(p_initial_payment,0) > 100000000 then raise exception 'Неверная сумма предоплаты'; end if;

  insert into public.ma_crm_customers(name,phone,phone_normalized,updated_at)
  values(coalesce(trim(p_customer_name),''),trim(p_phone),trim(p_phone_normalized),now())
  on conflict(phone_normalized) do update
    set phone=excluded.phone,
        name=case when excluded.name<>'' then excluded.name else ma_crm_customers.name end,
        updated_at=now()
  returning id into v_customer_id;

  insert into public.ma_crm_repairs(customer_id,service,device,model,imei,issue,estimated_price,manager,master,status,comment,created_by,updated_by,due_at,warranty_days,warranty_note)
  values(v_customer_id,trim(p_service),coalesce(trim(p_device),''),coalesce(trim(p_model),''),coalesce(trim(p_imei),''),trim(p_issue),coalesce(p_estimated_price,0),coalesce(trim(p_manager),''),coalesce(trim(p_master),''),'accepted',coalesce(trim(p_comment),''),coalesce(trim(p_actor),''),coalesce(trim(p_actor),''),p_due_at,coalesce(p_warranty_days,14),coalesce(trim(p_warranty_note),''))
  returning id into v_repair_id;

  insert into public.ma_crm_repair_status_history(repair_id,old_status,new_status,changed_by)
  values(v_repair_id,null,'accepted',coalesce(trim(p_actor),''));

  if coalesce(p_initial_payment,0)>0 then
    select id into v_cashbox_id from public.ma_crm_cashboxes
    where active=true and service=trim(p_service) and kind=v_method
    order by created_at asc limit 1;
    if v_cashbox_id is null then raise exception 'Для этой точки не настроена касса выбранного типа'; end if;
    insert into public.ma_crm_payments(repair_id,kind,method,amount,note,created_by,cashbox_id)
    values(v_repair_id,'payment',v_method,p_initial_payment,'Предоплата при приёме',coalesce(trim(p_actor),''),v_cashbox_id);
  end if;
  return v_repair_id;
end;
$$;

revoke all on function public.ma_crm_create_repair_bundle(text,text,text,text,text,text,text,text,numeric,text,text,text,timestamptz,integer,text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.ma_crm_create_repair_bundle(text,text,text,text,text,text,text,text,numeric,text,text,text,timestamptz,integer,text,numeric,text,text) to service_role;

create or replace function public.ma_crm_create_sale_bundle(
  p_customer_name text,
  p_phone text,
  p_phone_normalized text,
  p_service text,
  p_device text,
  p_model text,
  p_imei text,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_manager text,
  p_comment text,
  p_payment_method text,
  p_cashbox_id uuid,
  p_actor text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_sale_id uuid;
  v_cashbox_id uuid;
  v_method text := coalesce(nullif(trim(p_payment_method),''),'cash');
begin
  if p_phone_normalized is null or length(trim(p_phone_normalized)) < 10 then raise exception 'Проверь номер телефона'; end if;
  if p_service is null or trim(p_service) = '' then raise exception 'Выбери точку'; end if;
  if p_model is null or trim(p_model) = '' then raise exception 'Укажи модель'; end if;
  if coalesce(p_purchase_price,0)<0 or coalesce(p_purchase_price,0)>100000000 then raise exception 'Неверная закупочная цена'; end if;
  if coalesce(p_sale_price,0)<0 or coalesce(p_sale_price,0)>100000000 then raise exception 'Неверная цена продажи'; end if;
  if v_method not in ('cash','card','transfer','other') then raise exception 'Неверный способ оплаты'; end if;

  if p_cashbox_id is not null then
    select id into v_cashbox_id from public.ma_crm_cashboxes
    where id=p_cashbox_id and active=true and service=trim(p_service) and kind=v_method;
    if v_cashbox_id is null then raise exception 'Выбранная касса не подходит для этой точки или способа оплаты'; end if;
  else
    select id into v_cashbox_id from public.ma_crm_cashboxes
    where active=true and service=trim(p_service) and kind=v_method
    order by created_at asc limit 1;
    if v_cashbox_id is null then raise exception 'Для этой точки не настроена касса выбранного типа'; end if;
  end if;

  insert into public.ma_crm_customers(name,phone,phone_normalized,updated_at)
  values(coalesce(trim(p_customer_name),''),trim(p_phone),trim(p_phone_normalized),now())
  on conflict(phone_normalized) do update
    set phone=excluded.phone,
        name=case when excluded.name<>'' then excluded.name else ma_crm_customers.name end,
        updated_at=now()
  returning id into v_customer_id;

  insert into public.ma_crm_sales(customer_id,service,device,model,imei,purchase_price,sale_price,manager,comment,created_by,cashbox_id,payment_method)
  values(v_customer_id,trim(p_service),coalesce(trim(p_device),'Телефон'),trim(p_model),coalesce(trim(p_imei),''),coalesce(p_purchase_price,0),coalesce(p_sale_price,0),coalesce(trim(p_manager),''),coalesce(trim(p_comment),''),coalesce(trim(p_actor),''),v_cashbox_id,v_method)
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;

revoke all on function public.ma_crm_create_sale_bundle(text,text,text,text,text,text,text,numeric,numeric,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.ma_crm_create_sale_bundle(text,text,text,text,text,text,text,numeric,numeric,text,text,text,uuid,text) to service_role;
