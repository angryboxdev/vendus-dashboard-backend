-- Rollback de 20261115100000_stock_review_movement_cost_euros.sql:
-- repõe fn_stock_review_confirm da migração 20261110100000 (custo copiado em cêntimos).
-- Atenção: movimentos já criados com o custo em euros não são reconvertidos.

create or replace function public.fn_stock_review_confirm(
  p_org_id uuid,
  p_review_id uuid,
  p_expected_version integer,
  p_confirmed_by text,
  p_effective_date date,
  p_location_id uuid default null
)
  returns table (status text, version integer, movement_ids uuid[], already_applied boolean)
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_status text;
  v_version integer;
  v_line record;
  v_split jsonb;
  v_movement_ids uuid[] := '{}';
  v_item_active boolean;
  v_movement_id uuid;
  v_line_location uuid;
  v_quantity numeric;
  v_inventoriable integer := 0;
begin
  select spr.status, spr.version into v_status, v_version
  from stock_purchase_reviews spr
  where spr.id = p_review_id and spr.org_id = p_org_id
  for update;

  if v_status is null then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;

  if v_status in ('applied', 'excluded') then
    select coalesce(array_agg(sm.id), '{}') into v_movement_ids
    from stock_movements sm
    where sm.purchase_review_id = p_review_id;
    return query select v_status, v_version, v_movement_ids, true;
    return;
  end if;

  if v_version <> p_expected_version then
    raise exception 'stale_version' using errcode = 'P0001';
  end if;

  if v_status <> 'ready' then
    raise exception 'not_ready' using errcode = 'P0003';
  end if;

  if exists (
    select 1 from stock_review_lines
    where review_id = p_review_id and resolution_type = 'unresolved'
  ) then
    raise exception 'not_ready' using errcode = 'P0003';
  end if;

  for v_line in
    select * from stock_review_lines
    where review_id = p_review_id and resolution_type in ('existing_item', 'new_item')
  loop
    v_inventoriable := v_inventoriable + 1;
    select is_active into v_item_active from stock_items where id = v_line.stock_item_id;
    if not coalesce(v_item_active, false) then
      raise exception 'inactive_item' using errcode = 'P0004';
    end if;

    if v_line.location_splits is not null and jsonb_array_length(v_line.location_splits) > 0 then
      -- Divisão por lojas: quantidades explícitas, nunca a quantidade integral em cada loja.
      if abs((select sum((s->>'purchase_quantity')::numeric) from jsonb_array_elements(v_line.location_splits) s) - v_line.purchase_quantity) > 0.000001 then
        raise exception 'split_mismatch' using errcode = 'P0006';
      end if;
      for v_split in select * from jsonb_array_elements(v_line.location_splits)
      loop
        v_line_location := (v_split->>'location_id')::uuid;
        v_quantity := (v_split->>'purchase_quantity')::numeric * v_line.conversion_factor;
        insert into stock_movements (
          id, org_id, item_id, type, quantity, location_id,
          unit_cost_per_base_unit_with_vat, unit_cost_per_base_unit_without_vat,
          reason, reference, movement_date, effective_date, created_by,
          purchase_review_id, review_line_id
        )
        values (
          gen_random_uuid(), p_org_id, v_line.stock_item_id, 'purchase', v_quantity, v_line_location,
          v_line.unit_cost_per_base_unit_with_vat, v_line.unit_cost_per_base_unit_without_vat,
          null, 'stock_review:' || p_review_id || ':' || v_line.id, p_effective_date, p_effective_date, p_confirmed_by,
          p_review_id, v_line.id
        )
        on conflict (purchase_review_id, review_line_id, location_id) where purchase_review_id is not null do nothing
        returning id into v_movement_id;
        if v_movement_id is not null then
          v_movement_ids := array_append(v_movement_ids, v_movement_id);
        end if;
      end loop;
    else
      v_line_location := coalesce(v_line.location_id, p_location_id);
      if v_line_location is null then
        raise exception 'location_required' using errcode = 'P0005';
      end if;

      insert into stock_movements (
        id, org_id, item_id, type, quantity, location_id,
        unit_cost_per_base_unit_with_vat, unit_cost_per_base_unit_without_vat,
        reason, reference, movement_date, effective_date, created_by,
        purchase_review_id, review_line_id
      )
      values (
        gen_random_uuid(), p_org_id, v_line.stock_item_id, 'purchase', v_line.stock_quantity, v_line_location,
        v_line.unit_cost_per_base_unit_with_vat, v_line.unit_cost_per_base_unit_without_vat,
        null, 'stock_review:' || p_review_id || ':' || v_line.id, p_effective_date, p_effective_date, p_confirmed_by,
        p_review_id, v_line.id
      )
      on conflict (purchase_review_id, review_line_id, location_id) where purchase_review_id is not null do nothing
      returning id into v_movement_id;

      if v_movement_id is not null then
        v_movement_ids := array_append(v_movement_ids, v_movement_id);
      end if;
    end if;
  end loop;

  -- Todas as linhas «Não é item de stock» → «Excluída — não afeta Stock», sem movimento.
  update stock_purchase_reviews spr
  set status = case when v_inventoriable = 0 then 'excluded' else 'applied' end,
      applied_at = now(), version = spr.version + 1, updated_at = now()
  where spr.id = p_review_id
  returning spr.status, spr.version into v_status, v_version;

  return query select v_status, v_version, v_movement_ids, false;
end;
$function$;

grant execute on function public.fn_stock_review_confirm(uuid, uuid, integer, text, date, uuid)
  to public, "anon", "authenticated", "postgres", "service_role";

