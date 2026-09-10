create table if not exists public.ma_crm_inventory_products (
  id uuid primary key default gen_random_uuid(),
  sku text,
  name text not null,
  category text not null default 'part' check (category in ('part','accessory','device','other')),
  unit text not null default 'шт',
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0 and cost_price <= 100000000),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0 and sale_price <= 100000000),
  min_stock numeric(10,2) not null default 0 check (min_stock >= 0 and min_stock <= 1000000),
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ma_crm_inventory_products_sku_uq
  on public.ma_crm_inventory_products (lower(sku))
  where sku is not null and btrim(sku) <> '';
create index if not exists ma_crm_inventory_products_name_idx
  on public.ma_crm_inventory_products (lower(name));
create index if not exists ma_crm_inventory_products_category_idx
  on public.ma_crm_inventory_products (category, active);

alter table public.ma_crm_inventory_products enable row level security;

create table if not exists public.ma_crm_inventory_stock (
  product_id uuid not null references public.ma_crm_inventory_products(id) on delete cascade,
  service text not null,
  quantity numeric(12,2) not null default 0 check (quantity >= 0 and quantity <= 100000000),
  updated_at timestamptz not null default now(),
  primary key (product_id, service)
);

create index if not exists ma_crm_inventory_stock_service_idx
  on public.ma_crm_inventory_stock (service, quantity);

alter table public.ma_crm_inventory_stock enable row level security;

create table if not exists public.ma_crm_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ma_crm_inventory_products(id) on delete restrict,
  movement_type text not null check (movement_type in ('receipt','writeoff','transfer','repair_use','repair_return','adjustment')),
  from_service text,
  to_service text,
  quantity numeric(12,2) not null check (quantity > 0 and quantity <= 100000000),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0 and unit_cost <= 100000000),
  repair_id uuid references public.ma_crm_repairs(id) on delete set null,
  repair_item_id uuid references public.ma_crm_repair_items(id) on delete set null,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ma_crm_inventory_movements_product_idx
  on public.ma_crm_inventory_movements (product_id, created_at desc);
create index if not exists ma_crm_inventory_movements_created_idx
  on public.ma_crm_inventory_movements (created_at desc);
create index if not exists ma_crm_inventory_movements_repair_idx
  on public.ma_crm_inventory_movements (repair_id, created_at desc)
  where repair_id is not null;

alter table public.ma_crm_inventory_movements enable row level security;

alter table public.ma_crm_repair_items
  add column if not exists inventory_product_id uuid references public.ma_crm_inventory_products(id) on delete restrict,
  add column if not exists stock_service text;

create index if not exists ma_crm_repair_items_inventory_product_idx
  on public.ma_crm_repair_items (inventory_product_id)
  where inventory_product_id is not null;

create or replace function public.ma_crm_inventory_receive(
  p_product_id uuid,
  p_service text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_actor text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty numeric;
  v_cost numeric;
  v_name text;
  v_balance numeric;
  v_movement uuid;
begin
  v_qty := round(coalesce(p_quantity,0)::numeric,2);
  v_cost := round(coalesce(p_unit_cost,0)::numeric,2);
  if v_qty <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
  if v_cost < 0 then raise exception 'Себестоимость не может быть отрицательной'; end if;
  if btrim(coalesce(p_service,'')) = '' then raise exception 'Не указана точка'; end if;

  select name into v_name from public.ma_crm_inventory_products where id=p_product_id and active=true;
  if v_name is null then raise exception 'Товар не найден или выключен'; end if;

  insert into public.ma_crm_inventory_stock(product_id,service,quantity,updated_at)
  values(p_product_id,btrim(p_service),v_qty,now())
  on conflict(product_id,service) do update
    set quantity=public.ma_crm_inventory_stock.quantity+excluded.quantity,updated_at=now()
  returning quantity into v_balance;

  if v_cost > 0 then
    update public.ma_crm_inventory_products set cost_price=v_cost,updated_at=now() where id=p_product_id;
  end if;

  insert into public.ma_crm_inventory_movements(product_id,movement_type,to_service,quantity,unit_cost,note,created_by)
  values(p_product_id,'receipt',btrim(p_service),v_qty,v_cost,left(coalesce(p_note,''),500),left(coalesce(p_actor,''),100))
  returning id into v_movement;

  return jsonb_build_object('ok',true,'movementId',v_movement,'balance',v_balance);
end;
$$;

create or replace function public.ma_crm_inventory_writeoff(
  p_product_id uuid,
  p_service text,
  p_quantity numeric,
  p_actor text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty numeric;
  v_balance numeric;
  v_cost numeric;
  v_movement uuid;
begin
  v_qty := round(coalesce(p_quantity,0)::numeric,2);
  if v_qty <= 0 then raise exception 'Количество должно быть больше нуля'; end if;

  select s.quantity,p.cost_price into v_balance,v_cost
  from public.ma_crm_inventory_stock s
  join public.ma_crm_inventory_products p on p.id=s.product_id
  where s.product_id=p_product_id and s.service=btrim(p_service)
  for update of s;

  if v_balance is null or v_balance < v_qty then raise exception 'Недостаточно товара на этой точке'; end if;
  v_balance := v_balance-v_qty;
  update public.ma_crm_inventory_stock set quantity=v_balance,updated_at=now()
  where product_id=p_product_id and service=btrim(p_service);

  insert into public.ma_crm_inventory_movements(product_id,movement_type,from_service,quantity,unit_cost,note,created_by)
  values(p_product_id,'writeoff',btrim(p_service),v_qty,coalesce(v_cost,0),left(coalesce(p_note,''),500),left(coalesce(p_actor,''),100))
  returning id into v_movement;

  return jsonb_build_object('ok',true,'movementId',v_movement,'balance',v_balance);
end;
$$;

create or replace function public.ma_crm_inventory_transfer(
  p_product_id uuid,
  p_from_service text,
  p_to_service text,
  p_quantity numeric,
  p_actor text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty numeric;
  v_from numeric;
  v_to numeric;
  v_cost numeric;
  v_movement uuid;
begin
  v_qty := round(coalesce(p_quantity,0)::numeric,2);
  if v_qty <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
  if btrim(coalesce(p_from_service,''))='' or btrim(coalesce(p_to_service,''))='' then raise exception 'Укажи обе точки'; end if;
  if btrim(p_from_service)=btrim(p_to_service) then raise exception 'Точки должны отличаться'; end if;

  select s.quantity,p.cost_price into v_from,v_cost
  from public.ma_crm_inventory_stock s
  join public.ma_crm_inventory_products p on p.id=s.product_id
  where s.product_id=p_product_id and s.service=btrim(p_from_service)
  for update of s;

  if v_from is null or v_from < v_qty then raise exception 'Недостаточно товара для перемещения'; end if;
  v_from := v_from-v_qty;
  update public.ma_crm_inventory_stock set quantity=v_from,updated_at=now()
  where product_id=p_product_id and service=btrim(p_from_service);

  insert into public.ma_crm_inventory_stock(product_id,service,quantity,updated_at)
  values(p_product_id,btrim(p_to_service),v_qty,now())
  on conflict(product_id,service) do update
    set quantity=public.ma_crm_inventory_stock.quantity+excluded.quantity,updated_at=now()
  returning quantity into v_to;

  insert into public.ma_crm_inventory_movements(product_id,movement_type,from_service,to_service,quantity,unit_cost,note,created_by)
  values(p_product_id,'transfer',btrim(p_from_service),btrim(p_to_service),v_qty,coalesce(v_cost,0),left(coalesce(p_note,''),500),left(coalesce(p_actor,''),100))
  returning id into v_movement;

  return jsonb_build_object('ok',true,'movementId',v_movement,'fromBalance',v_from,'toBalance',v_to);
end;
$$;

create or replace function public.ma_crm_inventory_use_for_repair(
  p_repair_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty numeric;
  v_price numeric;
  v_service text;
  v_name text;
  v_cost numeric;
  v_default_price numeric;
  v_balance numeric;
  v_item uuid;
  v_movement uuid;
  v_total numeric;
begin
  v_qty := round(coalesce(p_quantity,0)::numeric,2);
  if v_qty <= 0 then raise exception 'Количество должно быть больше нуля'; end if;

  select service into v_service from public.ma_crm_repairs where id=p_repair_id;
  if v_service is null then raise exception 'Заказ не найден'; end if;

  select name,cost_price,sale_price into v_name,v_cost,v_default_price
  from public.ma_crm_inventory_products where id=p_product_id and active=true;
  if v_name is null then raise exception 'Товар не найден или выключен'; end if;

  v_price := round(coalesce(p_unit_price,v_default_price,0)::numeric,2);
  if v_price < 0 then raise exception 'Цена не может быть отрицательной'; end if;

  select quantity into v_balance from public.ma_crm_inventory_stock
  where product_id=p_product_id and service=v_service
  for update;
  if v_balance is null or v_balance < v_qty then raise exception 'Недостаточно запчастей на точке заказа'; end if;

  insert into public.ma_crm_repair_items(repair_id,item_type,title,quantity,unit_price,unit_cost,created_by,updated_at,inventory_product_id,stock_service)
  values(p_repair_id,'part',v_name,v_qty,v_price,coalesce(v_cost,0),left(coalesce(p_actor,''),100),now(),p_product_id,v_service)
  returning id into v_item;

  v_balance := v_balance-v_qty;
  update public.ma_crm_inventory_stock set quantity=v_balance,updated_at=now()
  where product_id=p_product_id and service=v_service;

  insert into public.ma_crm_inventory_movements(product_id,movement_type,from_service,quantity,unit_cost,repair_id,repair_item_id,note,created_by)
  values(p_product_id,'repair_use',v_service,v_qty,coalesce(v_cost,0),p_repair_id,v_item,'Автосписание в заказ',left(coalesce(p_actor,''),100))
  returning id into v_movement;

  select round(coalesce(sum(quantity*unit_price),0)::numeric,2) into v_total
  from public.ma_crm_repair_items where repair_id=p_repair_id;
  update public.ma_crm_repairs set final_price=v_total,updated_at=now(),updated_by=left(coalesce(p_actor,''),100)
  where id=p_repair_id;

  return jsonb_build_object('ok',true,'itemId',v_item,'movementId',v_movement,'balance',v_balance,'finalPrice',v_total,'service',v_service);
end;
$$;

create or replace function public.ma_crm_restore_stock_on_repair_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.inventory_product_id is not null and btrim(coalesce(old.stock_service,''))<>'' then
    insert into public.ma_crm_inventory_stock(product_id,service,quantity,updated_at)
    values(old.inventory_product_id,old.stock_service,old.quantity,now())
    on conflict(product_id,service) do update
      set quantity=public.ma_crm_inventory_stock.quantity+excluded.quantity,updated_at=now();

    insert into public.ma_crm_inventory_movements(product_id,movement_type,to_service,quantity,unit_cost,repair_id,note,created_by)
    values(old.inventory_product_id,'repair_return',old.stock_service,old.quantity,old.unit_cost,old.repair_id,'Автовозврат при удалении позиции','system');
  end if;
  return old;
end;
$$;

drop trigger if exists ma_crm_restore_stock_on_repair_item_delete_trg on public.ma_crm_repair_items;
create trigger ma_crm_restore_stock_on_repair_item_delete_trg
before delete on public.ma_crm_repair_items
for each row execute function public.ma_crm_restore_stock_on_repair_item_delete();

create or replace function public.ma_crm_guard_inventory_repair_item_update()
returns trigger
language plpgsql
as $$
begin
  if old.inventory_product_id is not null and (
    new.inventory_product_id is distinct from old.inventory_product_id or
    new.stock_service is distinct from old.stock_service or
    new.quantity is distinct from old.quantity
  ) then
    raise exception 'Складскую запчасть удалите и добавьте заново';
  end if;
  return new;
end;
$$;

drop trigger if exists ma_crm_guard_inventory_repair_item_update_trg on public.ma_crm_repair_items;
create trigger ma_crm_guard_inventory_repair_item_update_trg
before update on public.ma_crm_repair_items
for each row execute function public.ma_crm_guard_inventory_repair_item_update();

revoke all on function public.ma_crm_inventory_receive(uuid,text,numeric,numeric,text,text) from public;
revoke all on function public.ma_crm_inventory_writeoff(uuid,text,numeric,text,text) from public;
revoke all on function public.ma_crm_inventory_transfer(uuid,text,text,numeric,text,text) from public;
revoke all on function public.ma_crm_inventory_use_for_repair(uuid,uuid,numeric,numeric,text) from public;

grant execute on function public.ma_crm_inventory_receive(uuid,text,numeric,numeric,text,text) to service_role;
grant execute on function public.ma_crm_inventory_writeoff(uuid,text,numeric,text,text) to service_role;
grant execute on function public.ma_crm_inventory_transfer(uuid,text,text,numeric,text,text) to service_role;
grant execute on function public.ma_crm_inventory_use_for_repair(uuid,uuid,numeric,numeric,text) to service_role;