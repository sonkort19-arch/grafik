-- MA CRM order hardening: additive schema only. Safe for the current production frontend.

create table if not exists public.ma_crm_service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ma_crm_service_catalog (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.ma_crm_service_categories(id) on delete set null,
  name text not null,
  default_price numeric not null default 0 check (default_price >= 0),
  default_cost numeric not null default 0 check (default_cost >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id,name)
);

insert into public.ma_crm_service_categories(name,sort_order)
values
  ('Без вложений',10),
  ('Защитные',20),
  ('Компьютеры',30),
  ('Модулька',40),
  ('Ремонт платы',50),
  ('Модульные ремонты',60)
on conflict(name) do nothing;

create table if not exists public.ma_crm_service_compensation_rules (
  id uuid primary key default gen_random_uuid(),
  service_catalog_id uuid not null references public.ma_crm_service_catalog(id) on delete cascade,
  employee text not null default '',
  role text not null default 'master' check (role in ('manager','master')),
  percent numeric not null default 0 check (percent >= 0 and percent <= 100),
  fixed_amount numeric not null default 0 check (fixed_amount >= 0),
  active boolean not null default true,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  unique(service_catalog_id,employee,role)
);

alter table public.ma_crm_repair_items
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists executor text not null default '',
  add column if not exists service_catalog_id uuid references public.ma_crm_service_catalog(id) on delete set null;

do $$ begin
  alter table public.ma_crm_repair_items add constraint ma_crm_repair_items_discount_amount_check check (discount_amount >= 0);
exception when duplicate_object then null; end $$;

alter table public.ma_crm_payments
  add column if not exists category text not null default 'payment',
  add column if not exists customer_id uuid references public.ma_crm_customers(id) on delete set null,
  add column if not exists idempotency_key text;

do $$ begin
  alter table public.ma_crm_payments add constraint ma_crm_payments_category_check
    check (category in ('deposit','payment','additional','final','refund','deposit_refund'));
exception when duplicate_object then null; end $$;

create unique index if not exists ma_crm_payments_idempotency_key_uidx
  on public.ma_crm_payments(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';
create index if not exists ma_crm_payments_repair_created_idx
  on public.ma_crm_payments(repair_id,created_at desc);

-- Backfill the customer relation without changing any payment amounts.
update public.ma_crm_payments p
set customer_id=r.customer_id
from public.ma_crm_repairs r
where r.id=p.repair_id and p.customer_id is null;

create table if not exists public.ma_crm_order_events (
  id bigint generated always as identity primary key,
  repair_id uuid not null references public.ma_crm_repairs(id) on delete cascade,
  event_type text not null,
  employee text not null default '',
  old_value jsonb,
  new_value jsonb,
  description text not null default '',
  source_id text,
  created_at timestamptz not null default now()
);
create index if not exists ma_crm_order_events_repair_created_idx
  on public.ma_crm_order_events(repair_id,created_at desc,id desc);

create table if not exists public.ma_crm_payroll_entries (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ma_crm_repairs(id) on delete cascade,
  repair_item_id uuid references public.ma_crm_repair_items(id) on delete set null,
  source_type text not null default 'repair_item' check (source_type in ('repair_item','repair','manual')),
  source_id text not null,
  employee text not null,
  role text not null check (role in ('manager','master')),
  entry_type text not null default 'repair_percent' check (entry_type in ('repair_percent','service_percent','service_fixed','bonus','penalty','advance','payout','manual')),
  basis_amount numeric not null default 0,
  rate_percent numeric not null default 0 check (rate_percent >= 0 and rate_percent <= 100),
  fixed_amount numeric not null default 0,
  amount numeric not null default 0,
  source_status text not null default '',
  config_snapshot jsonb not null default '{}'::jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique(source_type,source_id,employee,entry_type)
);
create index if not exists ma_crm_payroll_entries_repair_idx on public.ma_crm_payroll_entries(repair_id);
create index if not exists ma_crm_payroll_entries_employee_created_idx on public.ma_crm_payroll_entries(employee,created_at desc);

create table if not exists public.ma_crm_status_definitions (
  code text primary key,
  name text not null,
  group_code text not null check (group_code in ('new','work','paused','ready','closed_success','closed_fail')),
  sort_order integer not null default 0,
  active boolean not null default true,
  system boolean not null default true,
  actions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.ma_crm_status_definitions(code,name,group_code,sort_order,actions)
values
  ('accepted','Принят','new',10,'{}'),
  ('diagnostics','Диагностика','work',20,'{}'),
  ('in_work','В работе','work',30,'{}'),
  ('waiting_part','Ждём запчасть','paused',40,'{}'),
  ('ready','Готов','ready',50,'{}'),
  ('issued','Выдан','closed_success',60,'{"requiresPayment":true,"snapshotPayroll":true,"offerDocuments":true}'::jsonb)
on conflict(code) do update set name=excluded.name,group_code=excluded.group_code,sort_order=excluded.sort_order,actions=excluded.actions,updated_at=now();

create table if not exists public.ma_crm_document_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('receipt','act','custom')),
  template_html text not null default '',
  active boolean not null default true,
  system boolean not null default false,
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.ma_crm_document_templates(code,name,kind,system)
values ('receipt','Приёмная квитанция','receipt',true),('act','Акт выполненных работ','act',true)
on conflict(code) do nothing;

create or replace function public.ma_crm_log_order_event(
  p_repair_id uuid,
  p_event_type text,
  p_employee text,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_description text default '',
  p_source_id text default null
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare v_id bigint;
begin
  insert into public.ma_crm_order_events(repair_id,event_type,employee,old_value,new_value,description,source_id)
  values(p_repair_id,left(coalesce(p_event_type,''),80),left(coalesce(p_employee,''),100),p_old_value,p_new_value,left(coalesce(p_description,''),1000),nullif(left(coalesce(p_source_id,''),160),''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ma_crm_log_order_event(uuid,text,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ma_crm_log_order_event(uuid,text,text,jsonb,jsonb,text,text) to service_role;

create or replace function public.ma_crm_snapshot_repair_payroll(p_repair_id uuid,p_actor text default '')
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_item record;
  v_employee text;
  v_basis numeric;
  v_percent numeric;
  v_fixed numeric;
  v_amount numeric;
  v_rule record;
  v_comp record;
  v_count integer := 0;
  v_total_profit numeric := 0;
begin
  select * into v_repair from public.ma_crm_repairs where id=p_repair_id;
  if v_repair.id is null then raise exception 'Заказ не найден'; end if;

  for v_item in
    select * from public.ma_crm_repair_items where repair_id=p_repair_id order by created_at,id
  loop
    v_employee:=coalesce(nullif(btrim(v_item.executor),''),nullif(btrim(v_repair.master),''));
    v_basis:=round((coalesce(v_item.quantity,0)*coalesce(v_item.unit_price,0)-coalesce(v_item.discount_amount,0)-coalesce(v_item.quantity,0)*coalesce(v_item.unit_cost,0))::numeric,2);
    v_total_profit:=v_total_profit+v_basis;
    if v_employee is null then continue; end if;
    v_percent:=0; v_fixed:=0; v_rule:=null; v_comp:=null;

    if v_item.service_catalog_id is not null then
      select * into v_rule from public.ma_crm_service_compensation_rules
      where service_catalog_id=v_item.service_catalog_id and active=true and role='master'
        and (employee=v_employee or employee='')
      order by case when employee=v_employee then 0 else 1 end
      limit 1;
    end if;

    if v_rule.id is not null then
      v_percent:=coalesce(v_rule.percent,0); v_fixed:=coalesce(v_rule.fixed_amount,0);
    else
      select * into v_comp from public.ma_crm_employee_compensation where employee=v_employee and active=true;
      v_percent:=coalesce(v_comp.repair_percent,0); v_fixed:=0;
    end if;

    v_amount:=round((v_basis*v_percent/100 + v_fixed*coalesce(v_item.quantity,1))::numeric,2);
    insert into public.ma_crm_payroll_entries(repair_id,repair_item_id,source_type,source_id,employee,role,entry_type,basis_amount,rate_percent,fixed_amount,amount,source_status,config_snapshot,created_by)
    values(v_repair.id,v_item.id,'repair_item',v_item.id::text,v_employee,'master',case when v_rule.id is not null and v_fixed>0 and v_percent=0 then 'service_fixed' when v_rule.id is not null then 'service_percent' else 'repair_percent' end,v_basis,v_percent,v_fixed,v_amount,'issued',jsonb_build_object('ruleId',v_rule.id,'catalogId',v_item.service_catalog_id,'unitPrice',v_item.unit_price,'unitCost',v_item.unit_cost,'discount',v_item.discount_amount,'quantity',v_item.quantity),left(coalesce(p_actor,''),100))
    on conflict(source_type,source_id,employee,entry_type) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;

  if btrim(coalesce(v_repair.manager,''))<>'' then
    select * into v_comp from public.ma_crm_employee_compensation where employee=v_repair.manager and active=true;
    v_percent:=coalesce(v_comp.repair_percent,0);
    v_amount:=round((v_total_profit*v_percent/100)::numeric,2);
    insert into public.ma_crm_payroll_entries(repair_id,source_type,source_id,employee,role,entry_type,basis_amount,rate_percent,fixed_amount,amount,source_status,config_snapshot,created_by)
    values(v_repair.id,'repair',v_repair.id::text,v_repair.manager,'manager','repair_percent',round(v_total_profit,2),v_percent,0,v_amount,'issued',jsonb_build_object('repairPercent',v_percent),left(coalesce(p_actor,''),100))
    on conflict(source_type,source_id,employee,entry_type) do nothing;
    if found then v_count:=v_count+1; end if;
  end if;

  return jsonb_build_object('inserted',v_count,'profit',round(v_total_profit,2));
end;
$$;
revoke all on function public.ma_crm_snapshot_repair_payroll(uuid,text) from public,anon,authenticated;
grant execute on function public.ma_crm_snapshot_repair_payroll(uuid,text) to service_role;

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

  perform public.ma_crm_log_order_event(v_repair.id,case when p_kind='refund' then 'payment_refund' else 'payment_added' end,p_actor,null,to_jsonb(v_payment),coalesce(p_note,''),v_payment.id::text);
  return jsonb_build_object('payment',to_jsonb(v_payment),'duplicate',false);
end;
$$;
revoke all on function public.ma_crm_add_order_payment(uuid,text,text,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.ma_crm_add_order_payment(uuid,text,text,text,numeric,text,text,text) to service_role;

create or replace function public.ma_crm_set_repair_status(p_repair_id uuid,p_status text,p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_now timestamptz:=now();
begin
  if p_repair_id is null then raise exception 'Не указан заказ'; end if;
  if not exists(select 1 from public.ma_crm_status_definitions where code=p_status and active=true) then raise exception 'Неверный статус'; end if;
  if p_status='issued' then raise exception 'Статус «Выдан» меняется только через выдачу заказа'; end if;
  select * into v_repair from public.ma_crm_repairs where id=p_repair_id for update;
  if v_repair.id is null then raise exception 'Заказ не найден'; end if;
  if v_repair.status=p_status then return jsonb_build_object('unchanged',true,'repair',to_jsonb(v_repair)); end if;

  update public.ma_crm_repairs set
    status=p_status,
    ready_at=case when p_status='ready' then v_now else null end,
    issued_at=null,
    updated_by=left(coalesce(p_actor,''),100),
    updated_at=v_now
  where id=v_repair.id;

  insert into public.ma_crm_repair_status_history(repair_id,old_status,new_status,changed_by)
  values(v_repair.id,v_repair.status,p_status,left(coalesce(p_actor,''),100));
  perform public.ma_crm_log_order_event(v_repair.id,'status_changed',p_actor,jsonb_build_object('status',v_repair.status),jsonb_build_object('status',p_status),'',null);
  return jsonb_build_object('unchanged',false,'oldStatus',v_repair.status,'newStatus',p_status);
end;
$$;
revoke all on function public.ma_crm_set_repair_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ma_crm_set_repair_status(uuid,text,text) to service_role;
