create table if not exists public.ma_crm_cashboxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service text not null default '',
  kind text not null default 'cash' check (kind in ('cash','card','transfer','bank','safe','other')),
  opening_balance numeric(14,2) not null default 0 check (opening_balance between -1000000000 and 1000000000),
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service,name)
);

create index if not exists ma_crm_cashboxes_service_idx on public.ma_crm_cashboxes(service);
alter table public.ma_crm_cashboxes enable row level security;

create table if not exists public.ma_crm_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  cashbox_id uuid not null references public.ma_crm_cashboxes(id) on delete restrict,
  kind text not null check (kind in ('income','expense','transfer_in','transfer_out')),
  category text not null default '',
  amount numeric(14,2) not null check (amount > 0 and amount <= 1000000000),
  service text not null default '',
  employee text not null default '',
  note text not null default '',
  transfer_group uuid,
  occurred_at timestamptz not null default now(),
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ma_crm_finance_transactions_cashbox_idx on public.ma_crm_finance_transactions(cashbox_id, occurred_at desc);
create index if not exists ma_crm_finance_transactions_service_idx on public.ma_crm_finance_transactions(service, occurred_at desc);
create index if not exists ma_crm_finance_transactions_kind_idx on public.ma_crm_finance_transactions(kind, occurred_at desc);
alter table public.ma_crm_finance_transactions enable row level security;

alter table public.ma_crm_payments add column if not exists cashbox_id uuid references public.ma_crm_cashboxes(id) on delete set null;
create index if not exists ma_crm_payments_cashbox_idx on public.ma_crm_payments(cashbox_id, created_at desc);

alter table public.ma_crm_sales add column if not exists cashbox_id uuid references public.ma_crm_cashboxes(id) on delete set null;
alter table public.ma_crm_sales add column if not exists payment_method text not null default 'cash';
alter table public.ma_crm_sales drop constraint if exists ma_crm_sales_payment_method_check;
alter table public.ma_crm_sales add constraint ma_crm_sales_payment_method_check check (payment_method in ('cash','card','transfer','other'));
create index if not exists ma_crm_sales_cashbox_idx on public.ma_crm_sales(cashbox_id, sold_at desc);

create or replace function public.ma_crm_finance_transfer(
  p_from_cashbox uuid,
  p_to_cashbox uuid,
  p_amount numeric,
  p_actor text,
  p_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.ma_crm_cashboxes%rowtype;
  v_to public.ma_crm_cashboxes%rowtype;
  v_group uuid := gen_random_uuid();
begin
  if p_from_cashbox is null or p_to_cashbox is null or p_from_cashbox = p_to_cashbox then
    raise exception 'Кассы должны отличаться';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    raise exception 'Неверная сумма';
  end if;
  select * into v_from from public.ma_crm_cashboxes where id = p_from_cashbox and active = true;
  select * into v_to from public.ma_crm_cashboxes where id = p_to_cashbox and active = true;
  if v_from.id is null or v_to.id is null then raise exception 'Касса не найдена'; end if;

  insert into public.ma_crm_finance_transactions(cashbox_id,kind,category,amount,service,employee,note,transfer_group,created_by)
  values
    (v_from.id,'transfer_out','Перевод между кассами',p_amount,v_from.service,p_actor,coalesce(p_note,''),v_group,p_actor),
    (v_to.id,'transfer_in','Перевод между кассами',p_amount,v_to.service,p_actor,coalesce(p_note,''),v_group,p_actor);

  return jsonb_build_object('transfer_group',v_group,'amount',p_amount,'from',v_from.name,'to',v_to.name);
end;
$$;

revoke all on function public.ma_crm_finance_transfer(uuid,uuid,numeric,text,text) from public;
revoke all on function public.ma_crm_finance_transfer(uuid,uuid,numeric,text,text) from anon;
revoke all on function public.ma_crm_finance_transfer(uuid,uuid,numeric,text,text) from authenticated;
grant execute on function public.ma_crm_finance_transfer(uuid,uuid,numeric,text,text) to service_role;