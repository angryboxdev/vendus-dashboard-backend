-- Módulo Stock — "Compra por rever": as duas únicas transações atómicas
-- multi-tabela deste módulo. PostgREST não dá transação multi-tabela
-- ad-hoc; `plpgsql` porque a lógica de negócio (versão obsoleta, já
-- aplicada, item inativo, não pronta) precisa de `RAISE EXCEPTION` com
-- códigos específicos que o adapter traduz para erros de domínio — ver
-- `get_stock_quantities_with_last_purchase`
-- (`20260829140000_scope_stock_quantities_rpc.sql`), o primeiro RPC do
-- repositório, mesma convenção (`p_org_id` primeiro parâmetro, security
-- definer, search_path fixo, filtro por org dentro da função — RLS
-- diferida por ADR-0007).

-- Idempotente por construção: `ON CONFLICT (invoice_id) DO NOTHING` —
-- chamar duas vezes para a mesma fatura nunca cria uma segunda revisão
-- (secção 11/35). Cria a revisão + linhas na mesma transação — nunca existe
-- uma janela com revisão sem linhas.
create or replace function public.fn_stock_review_create_from_invoice(
  p_org_id uuid,
  p_invoice_id uuid,
  p_review jsonb,
  p_lines jsonb
)
  returns table (review_id uuid, created_now boolean)
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_review_id uuid;
  v_created_now boolean := false;
  v_line jsonb;
begin
  insert into stock_purchase_reviews (
    org_id, invoice_id, source_invoice_version, source_hash,
    decision_source, decision_category_id, decision_supplier_id,
    decision_policy_used, decision_actor, decision_override_reason,
    supplier_name, invoice_number, invoice_date
  )
  values (
    p_org_id, p_invoice_id,
    coalesce((p_review->>'source_invoice_version')::integer, 1),
    p_review->>'source_hash',
    p_review->>'decision_source',
    nullif(p_review->>'decision_category_id', '')::uuid,
    nullif(p_review->>'decision_supplier_id', '')::uuid,
    p_review->>'decision_policy_used',
    nullif(p_review->>'decision_actor', ''),
    nullif(p_review->>'decision_override_reason', ''),
    p_review->>'supplier_name',
    p_review->>'invoice_number',
    (p_review->>'invoice_date')::date
  )
  on conflict (invoice_id) do nothing
  returning id into v_review_id;

  if v_review_id is not null then
    v_created_now := true;

    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      insert into stock_review_lines (
        org_id, review_id, invoice_line_id, description,
        purchase_quantity, purchase_unit, unit_cost_without_vat, total_with_vat
      )
      values (
        p_org_id, v_review_id,
        (v_line->>'invoice_line_id')::uuid,
        v_line->>'description',
        (v_line->>'purchase_quantity')::numeric,
        v_line->>'purchase_unit',
        (v_line->>'unit_cost_without_vat')::numeric,
        (v_line->>'total_with_vat')::numeric
      )
      on conflict (invoice_line_id) do nothing;
    end loop;
  else
    select id into v_review_id from stock_purchase_reviews
    where invoice_id = p_invoice_id and org_id = p_org_id;
  end if;

  return query select v_review_id, v_created_now;
end;
$function$;

grant execute on function public.fn_stock_review_create_from_invoice(uuid, uuid, jsonb, jsonb)
  to public, "anon", "authenticated", "postgres", "service_role";

-- "Confirmar e adicionar ao stock" — transação "tudo ou nada" (secção 34).
-- Lock otimista (versão obsoleta) e curto-circuito quando já `applied`
-- (idempotência do endpoint, secção 35/36: retry/duplo-clique devolve o
-- resultado já existente, nunca duplica). `p_location_id` é só um fallback
-- para linhas sem `location_id` próprio — nunca decidido pelo Centro de
-- Custo (secção 46).
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
  v_movement_ids uuid[] := '{}';
  v_item_active boolean;
  v_movement_id uuid;
  v_line_location uuid;
begin
  select status, version into v_status, v_version
  from stock_purchase_reviews
  where id = p_review_id and org_id = p_org_id
  for update;

  if v_status is null then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;

  if v_status = 'applied' then
    select coalesce(array_agg(id), '{}') into v_movement_ids
    from stock_movements
    where purchase_review_id = p_review_id;
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
    select is_active into v_item_active from stock_items where id = v_line.stock_item_id;
    if not coalesce(v_item_active, false) then
      raise exception 'inactive_item' using errcode = 'P0004';
    end if;

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
    on conflict (purchase_review_id, review_line_id) where purchase_review_id is not null do nothing
    returning id into v_movement_id;

    if v_movement_id is not null then
      v_movement_ids := array_append(v_movement_ids, v_movement_id);
    end if;
  end loop;

  update stock_purchase_reviews
  set status = 'applied', applied_at = now(), version = version + 1, updated_at = now()
  where id = p_review_id
  returning status, version into v_status, v_version;

  return query select v_status, v_version, v_movement_ids, false;
end;
$function$;

grant execute on function public.fn_stock_review_confirm(uuid, uuid, integer, text, date, uuid)
  to public, "anon", "authenticated", "postgres", "service_role";
