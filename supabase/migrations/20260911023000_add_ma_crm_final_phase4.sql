alter table public.ma_crm_pins add column if not exists role text not null default 'manager';
alter table public.ma_crm_pins drop constraint if exists ma_crm_pins_role_check;
alter table public.ma_crm_pins add constraint ma_crm_pins_role_check check (role in ('manager','master'));

with schedule_roles as (
  select
    e->>'name' as employee,
    case when e->>'role' in ('manager','master') then e->>'role' else 'manager' end as role,
    coalesce((e->>'inactive')::boolean,false) as inactive
  from public.ma_schedule_config c
  cross join lateral jsonb_array_elements(coalesce(c.settings->'employeeSchedules','[]'::jsonb)) e
  where c.id='main' and coalesce(e->>'name','')<>''
)
update public.ma_crm_pins p
set role=s.role,
    active=case when s.inactive then false else p.active end,
    updated_at=now()
from schedule_roles s
where p.employee=s.employee;

alter table public.ma_crm_repairs add column if not exists warranty_parent_id uuid references public.ma_crm_repairs(id) on delete set null;
alter table public.ma_crm_repairs add column if not exists warranty_case boolean not null default false;
alter table public.ma_crm_repairs add column if not exists warranty_reason text not null default '';
create index if not exists ma_crm_repairs_warranty_parent_idx on public.ma_crm_repairs(warranty_parent_id);

create table if not exists public.ma_crm_repair_files (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ma_crm_repairs(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes between 0 and 5242880),
  note text not null default '',
  uploaded_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ma_crm_repair_files_repair_idx on public.ma_crm_repair_files(repair_id,created_at desc);
alter table public.ma_crm_repair_files enable row level security;

create table if not exists public.ma_crm_employee_compensation (
  employee text primary key,
  role text not null default 'manager' check (role in ('manager','master')),
  fixed_monthly numeric(14,2) not null default 0 check (fixed_monthly between 0 and 100000000),
  repair_percent numeric(7,3) not null default 0 check (repair_percent between 0 and 100),
  sales_percent numeric(7,3) not null default 0 check (sales_percent between 0 and 100),
  active boolean not null default true,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.ma_crm_employee_compensation enable row level security;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'ma-crm-files',
  'ma-crm-files',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;