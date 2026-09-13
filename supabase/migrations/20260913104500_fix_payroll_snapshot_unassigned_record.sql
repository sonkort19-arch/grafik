-- Fix issuing an order when no service compensation rule exists.
-- PL/pgSQL RECORD variables are not safe to dereference before a SELECT assigns a row.
-- Use scalar rule/compensation fields so missing configuration cleanly falls back to 0%.

create or replace function public.ma_crm_snapshot_repair_payroll(
  p_repair_id uuid,
  p_actor text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ma_crm_repairs%rowtype;
  v_item public.ma_crm_repair_items%rowtype;
  v_employee text;
  v_basis numeric;
  v_percent numeric;
  v_fixed numeric;
  v_amount numeric;
  v_rule_id uuid;
  v_rule_percent numeric;
  v_rule_fixed numeric;
  v_comp_percent numeric;
  v_count integer := 0;
  v_total_profit numeric := 0;
begin
  select * into v_repair
  from public.ma_crm_repairs
  where id = p_repair_id;

  if v_repair.id is null then
    raise exception 'Заказ не найден';
  end if;

  for v_item in
    select *
    from public.ma_crm_repair_items
    where repair_id = p_repair_id
    order by created_at, id
  loop
    v_employee := coalesce(
      nullif(btrim(v_item.executor), ''),
      nullif(btrim(v_repair.master), '')
    );
    v_basis := round((
      coalesce(v_item.quantity, 0) * coalesce(v_item.unit_price, 0)
      - coalesce(v_item.discount_amount, 0)
      - coalesce(v_item.quantity, 0) * coalesce(v_item.unit_cost, 0)
    )::numeric, 2);
    v_total_profit := v_total_profit + v_basis;

    if v_employee is null then
      continue;
    end if;

    v_percent := 0;
    v_fixed := 0;
    v_rule_id := null;
    v_rule_percent := 0;
    v_rule_fixed := 0;
    v_comp_percent := 0;

    if v_item.service_catalog_id is not null then
      select id, coalesce(percent, 0), coalesce(fixed_amount, 0)
      into v_rule_id, v_rule_percent, v_rule_fixed
      from public.ma_crm_service_compensation_rules
      where service_catalog_id = v_item.service_catalog_id
        and active = true
        and role = 'master'
        and (employee = v_employee or employee = '')
      order by case when employee = v_employee then 0 else 1 end
      limit 1;
    end if;

    if v_rule_id is not null then
      v_percent := coalesce(v_rule_percent, 0);
      v_fixed := coalesce(v_rule_fixed, 0);
    else
      select coalesce(repair_percent, 0)
      into v_comp_percent
      from public.ma_crm_employee_compensation
      where employee = v_employee
        and active = true
      limit 1;
      v_percent := coalesce(v_comp_percent, 0);
      v_fixed := 0;
    end if;

    v_amount := round((
      v_basis * v_percent / 100
      + v_fixed * coalesce(v_item.quantity, 1)
    )::numeric, 2);

    insert into public.ma_crm_payroll_entries(
      repair_id,
      repair_item_id,
      source_type,
      source_id,
      employee,
      role,
      entry_type,
      basis_amount,
      rate_percent,
      fixed_amount,
      amount,
      source_status,
      config_snapshot,
      created_by
    ) values (
      v_repair.id,
      v_item.id,
      'repair_item',
      v_item.id::text,
      v_employee,
      'master',
      case
        when v_rule_id is not null and v_fixed > 0 and v_percent = 0 then 'service_fixed'
        when v_rule_id is not null then 'service_percent'
        else 'repair_percent'
      end,
      v_basis,
      v_percent,
      v_fixed,
      v_amount,
      'issued',
      jsonb_build_object(
        'ruleId', v_rule_id,
        'catalogId', v_item.service_catalog_id,
        'unitPrice', v_item.unit_price,
        'unitCost', v_item.unit_cost,
        'discount', v_item.discount_amount,
        'quantity', v_item.quantity
      ),
      left(coalesce(p_actor, ''), 100)
    )
    on conflict(source_type, source_id, employee, entry_type) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  if btrim(coalesce(v_repair.manager, '')) <> '' then
    v_comp_percent := 0;
    select coalesce(repair_percent, 0)
    into v_comp_percent
    from public.ma_crm_employee_compensation
    where employee = v_repair.manager
      and active = true
    limit 1;

    v_percent := coalesce(v_comp_percent, 0);
    v_amount := round((v_total_profit * v_percent / 100)::numeric, 2);

    insert into public.ma_crm_payroll_entries(
      repair_id,
      source_type,
      source_id,
      employee,
      role,
      entry_type,
      basis_amount,
      rate_percent,
      fixed_amount,
      amount,
      source_status,
      config_snapshot,
      created_by
    ) values (
      v_repair.id,
      'repair',
      v_repair.id::text,
      v_repair.manager,
      'manager',
      'repair_percent',
      round(v_total_profit, 2),
      v_percent,
      0,
      v_amount,
      'issued',
      jsonb_build_object('repairPercent', v_percent),
      left(coalesce(p_actor, ''), 100)
    )
    on conflict(source_type, source_id, employee, entry_type) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end if;

  return jsonb_build_object(
    'inserted', v_count,
    'profit', round(v_total_profit, 2)
  );
end;
$$;

revoke all on function public.ma_crm_snapshot_repair_payroll(uuid,text) from public, anon, authenticated;
grant execute on function public.ma_crm_snapshot_repair_payroll(uuid,text) to service_role;
