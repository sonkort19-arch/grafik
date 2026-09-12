alter table public.ma_crm_repair_items
  add column if not exists display_type text;

update public.ma_crm_repair_items
set display_type = item_type
where display_type is null;

alter table public.ma_crm_repair_items
  drop constraint if exists ma_crm_repair_items_display_type_check;

alter table public.ma_crm_repair_items
  add constraint ma_crm_repair_items_display_type_check
  check (display_type is null or display_type in ('service','part'));
