-- MA CRM: atomic order-item writes, extensible statuses, and DB-backed lifecycle events.
-- Depends on 20260913040000_harden_ma_crm_order_module.sql,
-- 20260913041000_upgrade_ma_crm_issue_and_events.sql and
-- 20260913041500_order_item_idempotency.sql.

-- The status catalog becomes the source of truth. Existing system statuses are
-- already seeded before this migration, so current orders remain valid.
alter table public.ma_crm_repairs drop constraint if exists ma_crm_repairs_status_check;

do $$ begin
  alter table public.ma_crm_repairs
    add constraint ma_crm_repairs_status_fkey
    foreign key (status) references public.ma_crm_status_definitions(code);
exception when duplicate_object then null; end $$;

create or replace function public.ma_crm_add_order_item(
  p_repair_id uuid,
  p_item_type text,
  p_title text,
  p_quantity numeric,
  p_unit_price numeric,
  p_unit_cost numeric,
  p_discount_amount numeric,
  p_executor text,
  p_service_catalog_id uuid,
  p_inventory_product_id uuid,
  p_actor text,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_existing public.ma_crm_repair_items%rowtype;
  v_item public.ma_crm_repair_items%rowtype;
  v_product public.ma_crm_inventory_products%rowtype;
  v_balance numeric;
  v_total numeric;
  v_movement uuid;
  v_key text:=nullif(btrim(coalesce(p_idempotency_key,'')),'');
  v_title text:=btrim(coalesce(p_title,''));
  v_qty numeric:=round(coalesce(p_quantity,0)::numeric,2);
  v_price numeric:=round(coalesce(p_unit_price,0)::numeric,2);
  v_cost numeric:=round(coalesce(p_unit_cost,0)::numeric,2);
  v_discount numeric:=round(coalesce(p_discount_amount,0)::numeric,2);
begin
  if p_repair_id is null then raise exception 'Не указан заказ'; end if;
  if p_item_type not in ('service','part') then raise exception 'Неверный тип позиции'; end if;
  if v_qty<=0 or v_qty>10000 then raise exception 'Количество должно быть больше нуля'; end if;
  if v_price<0 or v_price>100000000 then raise exception 'Неверная цена'; end if;
  if v_cost<0 or v_cost>100000000 then raise exception 'Неверная себестоимость'; end if;
  if v_discount<0 or v_discount>v_qty*v_price then raise exception 'Неверная скидка'; end if;

  -- One order row lock serializes duplicate submits for this order before any
  -- inventory mutation happens.
  select * into v_repair from public.ma_crm_repairs where id=p_repair_id for update;
  if v_repair.id is null then raise exception 'Заказ не найден'; end if;

  if v_key is not null then
    select * into v_existing from public.ma_crm_repair_items where idempotency_key=v_key limit 1;
    if v_existing.id is not null then
      if v_existing.repair_id<>p_repair_id then raise exception 'Ключ операции уже использован'; end if;
      select round(coalesce(sum(quantity*unit_price-discount_amount),0)::numeric,2)
        into v_total from public.ma_crm_repair_items where repair_id=p_repair_id;
      return jsonb_build_object('item',to_jsonb(v_existing),'duplicate',true,'finalPrice',v_total);
    end if;
  end if;

  if p_inventory_product_id is not null then
    if p_item_type<>'part' then raise exception 'Складская позиция должна быть товаром'; end if;
    select * into v_product from public.ma_crm_inventory_products
      where id=p_inventory_product_id and active=true;
    if v_product.id is null then raise exception 'Товар не найден или выключен'; end if;

    select quantity into v_balance from public.ma_crm_inventory_stock
      where product_id=v_product.id and service=v_repair.service
      for update;
    if v_balance is null or v_balance<v_qty then raise exception 'Недостаточно товара на точке заказа'; end if;

    insert into public.ma_crm_repair_items(
      repair_id,item_type,display_type,title,quantity,unit_price,unit_cost,
      discount_amount,executor,created_by,updated_at,inventory_product_id,
      stock_service,idempotency_key
    ) values(
      v_repair.id,'part','part',v_product.name,v_qty,v_price,coalesce(v_product.cost_price,0),
      v_discount,left(coalesce(p_executor,''),100),left(coalesce(p_actor,''),100),now(),v_product.id,
      v_repair.service,v_key
    ) returning * into v_item;

    update public.ma_crm_inventory_stock
      set quantity=quantity-v_qty,updated_at=now()
      where product_id=v_product.id and service=v_repair.service;

    insert into public.ma_crm_inventory_movements(
      product_id,movement_type,from_service,quantity,unit_cost,repair_id,
      repair_item_id,note,created_by
    ) values(
      v_product.id,'repair_use',v_repair.service,v_qty,coalesce(v_product.cost_price,0),v_repair.id,
      v_item.id,'Автосписание в заказ',left(coalesce(p_actor,''),100)
    ) returning id into v_movement;
  else
    if v_title='' then raise exception 'Укажи название позиции'; end if;
    insert into public.ma_crm_repair_items(
      repair_id,item_type,display_type,title,quantity,unit_price,unit_cost,
      discount_amount,executor,service_catalog_id,created_by,updated_at,idempotency_key
    ) values(
      v_repair.id,p_item_type,p_item_type,left(v_title,240),v_qty,v_price,v_cost,
      v_discount,left(coalesce(p_executor,''),100),p_service_catalog_id,
      left(coalesce(p_actor,''),100),now(),v_key
    ) returning * into v_item;
  end if;

  select round(coalesce(sum(quantity*unit_price-discount_amount),0)::numeric,2)
    into v_total from public.ma_crm_repair_items where repair_id=v_repair.id;
  update public.ma_crm_repairs
    set final_price=v_total,updated_at=now(),updated_by=left(coalesce(p_actor,''),100)
    where id=v_repair.id;

  perform public.ma_crm_log_order_event(
    v_repair.id,'item_added',p_actor,null,to_jsonb(v_item),
    'Добавлена позиция «'||v_item.title||'»','item:'||v_item.id::text
  );

  return jsonb_build_object(
    'item',to_jsonb(v_item),'duplicate',false,'finalPrice',v_total,
    'inventoryMovementId',v_movement
  );
end;
$$;

revoke all on function public.ma_crm_add_order_item(uuid,text,text,numeric,numeric,numeric,numeric,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ma_crm_add_order_item(uuid,text,text,numeric,numeric,numeric,numeric,text,uuid,uuid,text,text) to service_role;

-- Future orders/files are logged at the database boundary as well, so an
-- alternate API path cannot silently skip the order history.
create or replace function public.ma_crm_event_after_repair_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.ma_crm_log_order_event(
    new.id,'order_created',coalesce(new.created_by,''),null,
    jsonb_build_object('orderNo',new.order_no,'status',new.status),
    'Заказ создан','repair:'||new.id::text
  );
  if new.warranty_parent_id is not null then
    perform public.ma_crm_log_order_event(
      new.warranty_parent_id,'warranty_created',coalesce(new.created_by,''),null,
      jsonb_build_object('repairId',new.id,'orderNo',new.order_no,'reason',new.warranty_reason),
      'Создан гарантийный заказ №'||new.order_no,'warranty:'||new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ma_crm_repair_order_event_ai on public.ma_crm_repairs;
create trigger ma_crm_repair_order_event_ai
after insert on public.ma_crm_repairs
for each row execute function public.ma_crm_event_after_repair_insert();

create or replace function public.ma_crm_event_after_file_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.ma_crm_log_order_event(
    new.repair_id,'file_uploaded',coalesce(new.uploaded_by,''),null,
    jsonb_build_object('fileId',new.id,'name',new.file_name,'mime',new.mime_type,'size',new.size_bytes),
    'Добавлен файл «'||new.file_name||'»','file:'||new.id::text
  );
  return new;
end;
$$;

drop trigger if exists ma_crm_repair_file_event_ai on public.ma_crm_repair_files;
create trigger ma_crm_repair_file_event_ai
after insert on public.ma_crm_repair_files
for each row execute function public.ma_crm_event_after_file_insert();

create or replace function public.ma_crm_event_after_file_delete()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.ma_crm_log_order_event(
    old.repair_id,'file_deleted','system',to_jsonb(old),null,
    'Удалён файл «'||old.file_name||'»','file-delete:'||old.id::text
  );
  return old;
end;
$$;

drop trigger if exists ma_crm_repair_file_event_ad on public.ma_crm_repair_files;
create trigger ma_crm_repair_file_event_ad
after delete on public.ma_crm_repair_files
for each row execute function public.ma_crm_event_after_file_delete();
