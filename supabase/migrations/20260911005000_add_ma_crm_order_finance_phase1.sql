alter table public.ma_crm_repairs
  add column if not exists due_at timestamptz,
  add column if not exists warranty_days integer not null default 14,
  add column if not exists warranty_note text not null default '';

alter table public.ma_crm_repairs
  drop constraint if exists ma_crm_repairs_warranty_days_check;

alter table public.ma_crm_repairs
  add constraint ma_crm_repairs_warranty_days_check
  check (warranty_days >= 0 and warranty_days <= 730);

create table if not exists public.ma_crm_repair_items (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ma_crm_repairs(id) on delete cascade,
  item_type text not null check (item_type in ('service','part')),
  title text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0 and quantity <= 10000),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0 and unit_price <= 100000000),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0 and unit_cost <= 100000000),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ma_crm_repair_items_repair_id_idx
  on public.ma_crm_repair_items(repair_id);

alter table public.ma_crm_repair_items enable row level security;

create table if not exists public.ma_crm_payments (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ma_crm_repairs(id) on delete cascade,
  kind text not null default 'payment' check (kind in ('payment','refund')),
  method text not null default 'cash' check (method in ('cash','card','transfer','other')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000000),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ma_crm_payments_repair_id_idx
  on public.ma_crm_payments(repair_id);
create index if not exists ma_crm_payments_created_at_idx
  on public.ma_crm_payments(created_at desc);

alter table public.ma_crm_payments enable row level security;
