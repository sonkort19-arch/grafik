-- MA CRM: custom-status compatibility and DB-backed lifecycle events.
-- This migration is additive/compatible with existing business data.

-- The status catalog becomes the source of truth. Existing system statuses are
-- already seeded by the previous migration, so current rows remain valid.
alter table public.ma_crm_repairs drop constraint if exists ma_crm_repairs_status_check;

do $$ begin
  alter table public.ma_crm_repairs
    add constraint ma_crm_repairs_status_fkey
    foreign key (status) references public.ma_crm_status_definitions(code);
exception when duplicate_object then null; end $$;

-- API and DB triggers can legitimately observe the same lifecycle event.
-- Source ids make those writes idempotent instead of creating duplicate history.
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
declare
  v_id bigint;
  v_source text:=nullif(left(btrim(coalesce(p_source_id,'')),160),'');
begin
  insert into public.ma_crm_order_events(repair_id,event_type,employee,old_value,new_value,description,source_id)
  values(
    p_repair_id,left(coalesce(p_event_type,''),80),left(coalesce(p_employee,''),100),
    p_old_value,p_new_value,left(coalesce(p_description,''),1000),v_source
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null and v_source is not null then
    select id into v_id from public.ma_crm_order_events
    where repair_id=p_repair_id and source_id=v_source
    order by id desc limit 1;
  end if;
  return v_id;
end;
$$;
revoke all on function public.ma_crm_log_order_event(uuid,text,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ma_crm_log_order_event(uuid,text,text,jsonb,jsonb,text,text) to service_role;

-- New orders are logged even when created through an older compatible API path.
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

-- Initial payments can still be created by the existing atomic repair-create RPC.
-- The insert trigger guarantees those operations also enter order_events.
create or replace function public.ma_crm_event_after_payment_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.ma_crm_log_order_event(
    new.repair_id,
    case when new.kind='refund' then 'payment_refund' else 'payment_added' end,
    coalesce(new.created_by,''),null,
    jsonb_build_object(
      'id',new.id,'kind',new.kind,'method',new.method,'category',new.category,
      'amount',new.amount,'cashboxId',new.cashbox_id
    ),coalesce(new.note,''),'payment:'||new.id::text
  );
  return new;
end;
$$;

drop trigger if exists ma_crm_payment_order_event_ai on public.ma_crm_payments;
create trigger ma_crm_payment_order_event_ai
after insert on public.ma_crm_payments
for each row execute function public.ma_crm_event_after_payment_insert();

-- Uploads are logged at the DB boundary. API-level logging uses the same source id,
-- so the idempotent event function prevents duplicate rows.
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
