-- Módulo Stock — Contagem Física de Stock 2.0: as três únicas transações
-- atómicas multi-tabela deste módulo. PostgREST não dá transação
-- multi-tabela ad-hoc; `plpgsql` porque a lógica de negócio (versão
-- obsoleta, sobreposição de sessões, item inativo, ainda não pronta)
-- precisa de `RAISE EXCEPTION` com códigos específicos que o adapter
-- traduz para erros de domínio — mesma convenção de
-- `fn_stock_review_create_from_invoice`/`fn_stock_review_confirm`
-- (`p_org_id` primeiro parâmetro, security definer, search_path fixo,
-- filtro por org dentro da função — RLS diferida por ADR-0007).

-- "Iniciar contagem": materializa o escopo em linhas (idempotente,
-- ON CONFLICT DO NOTHING) e verifica sobreposição com outra sessão ativa na
-- mesma loja (secção 52) — a menos que `p_override_overlap` venha true
-- (validado como admin-only pelo use case/controller) com motivo não vazio.
create or replace function public.fn_stock_count_start_session(
  p_org_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_lines jsonb,
  p_started_by text,
  p_override_overlap boolean default false,
  p_override_reason text default null
)
  returns table (session_id uuid, status text, version integer, lines_materialized integer)
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_status text;
  v_version integer;
  v_location_id uuid;
  v_conflict_id uuid;
  v_conflict_number bigint;
  v_lines_materialized integer := 0;
begin
  select status, version, location_id into v_status, v_version, v_location_id
  from stock_count_sessions
  where id = p_session_id and org_id = p_org_id
  for update;

  if v_status is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- Idempotente a duplo-clique/retry: já em contagem devolve o estado atual
  -- sem re-verificar sobreposição (essa validação só corre na transição
  -- draft→counting real).
  if v_status = 'counting' then
    select count(*) into v_lines_materialized from stock_count_lines where session_id = p_session_id;
    return query select p_session_id, v_status, v_version, v_lines_materialized;
    return;
  end if;

  if v_status <> 'draft' then
    raise exception 'invalid_session_state' using errcode = 'P0008';
  end if;

  if v_version <> p_expected_version then
    raise exception 'stale_version' using errcode = 'P0001';
  end if;

  if not p_override_overlap then
    select s.id, s.session_number into v_conflict_id, v_conflict_number
    from stock_count_sessions s
    join stock_count_lines l on l.session_id = s.id
    where s.org_id = p_org_id
      and s.id <> p_session_id
      and s.location_id = v_location_id
      and s.status in ('draft', 'counting', 'reviewing', 'ready')
      and l.item_id in (select (value->>'item_id')::uuid from jsonb_array_elements(p_lines) as value)
    limit 1;

    if v_conflict_id is not null then
      raise exception 'overlapping_session:%:%', v_conflict_id, v_conflict_number using errcode = 'P0006';
    end if;
  else
    if p_override_reason is null or length(trim(p_override_reason)) = 0 then
      raise exception 'override_reason_required' using errcode = 'P0007';
    end if;
  end if;

  insert into stock_count_lines (org_id, session_id, item_id, status, is_unscoped)
  select p_org_id, p_session_id, (value->>'item_id')::uuid, 'not_counted', coalesce((value->>'is_unscoped')::boolean, false)
  from jsonb_array_elements(p_lines) as value
  on conflict (session_id, item_id) do nothing;

  get diagnostics v_lines_materialized = row_count;

  update stock_count_sessions
  set status = 'counting', started_at = now(), started_by = p_started_by, version = version + 1
  where id = p_session_id
  returning status, version into v_status, v_version;

  return query select p_session_id, v_status, v_version, v_lines_materialized;
end;
$function$;

grant execute on function public.fn_stock_count_start_session(uuid, uuid, integer, jsonb, text, boolean, text)
  to public, "anon", "authenticated", "postgres", "service_role";

-- "Registar tentativa de contagem": snapshot teórico local (fingerprint —
-- nunca uma sequência global, ver README), deteção de movimento durante a
-- contagem (secção 26/27 — todo movimento no intervalo força recontagem,
-- incondicionalmente) e lock otimista da linha. `p_tolerance_snapshot` já
-- vem resolvido pela hierarquia item→categoria→empresa em TS (não depende
-- do stock teórico vivo) — a RPC só compara.
create or replace function public.fn_stock_count_submit_attempt(
  p_org_id uuid,
  p_count_line_id uuid,
  p_expected_line_version integer,
  p_counted_quantity numeric,
  p_components jsonb,
  p_counted_by text,
  p_count_started_at timestamptz,
  p_tolerance_snapshot jsonb default null,
  p_reason text default null
)
  returns table (
    attempt_id uuid, attempt_number integer, line_status text, line_version integer,
    system_quantity_at_count numeric, ledger_version_at_count integer,
    final_variance numeric, variance_percent numeric, variance_value numeric,
    movements_during_count boolean
  )
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_item_id uuid;
  v_line_status text;
  v_line_version integer;
  v_session_status text;
  v_location_id uuid;
  v_system_quantity numeric;
  v_ledger_version_at_count integer;
  v_ledger_version_now integer;
  v_movements_during_count boolean;
  v_attempt_id uuid;
  v_attempt_number integer;
  v_unit_cost numeric;
  v_absolute numeric;
  v_percent numeric;
  v_variance_value numeric;
  v_breach boolean;
  v_new_status text;
begin
  select l.item_id, l.status, l.version, s.status, s.location_id
  into v_item_id, v_line_status, v_line_version, v_session_status, v_location_id
  from stock_count_lines l
  join stock_count_sessions s on s.id = l.session_id
  where l.id = p_count_line_id and l.org_id = p_org_id
  for update of l;

  if v_item_id is null then
    raise exception 'line_not_found' using errcode = 'P0002';
  end if;

  if v_session_status not in ('counting', 'reviewing') then
    raise exception 'session_not_counting' using errcode = 'P0009';
  end if;

  if v_line_status = 'resolved' then
    raise exception 'line_already_resolved' using errcode = 'P0010';
  end if;

  if v_line_version <> p_expected_line_version then
    raise exception 'stale_version' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0), count(*)
  into v_system_quantity, v_ledger_version_at_count
  from stock_movements
  where org_id = p_org_id and item_id = v_item_id and location_id = v_location_id and created_at <= p_count_started_at;

  v_attempt_number := coalesce((select max(attempt_number) from stock_count_attempts where count_line_id = p_count_line_id), 0) + 1;

  insert into stock_count_attempts (
    org_id, count_line_id, attempt_number, count_started_at, counted_at,
    counted_quantity, system_quantity_at_count, ledger_version_at_count,
    movements_during_count, counted_by, is_manual, reason
  ) values (
    p_org_id, p_count_line_id, v_attempt_number, p_count_started_at, now(),
    p_counted_quantity, v_system_quantity, v_ledger_version_at_count,
    false, p_counted_by, false, p_reason
  )
  returning id into v_attempt_id;

  insert into stock_count_components (org_id, attempt_id, count_area_id, quantity, unit, conversion_factor, base_quantity)
  select p_org_id, v_attempt_id,
    nullif(c->>'count_area_id', '')::uuid,
    (c->>'quantity')::numeric,
    c->>'unit',
    coalesce((c->>'conversion_factor')::numeric, 1),
    (c->>'base_quantity')::numeric
  from jsonb_array_elements(p_components) as c;

  select count(*) into v_ledger_version_now
  from stock_movements
  where org_id = p_org_id and item_id = v_item_id and location_id = v_location_id and created_at <= now();

  v_movements_during_count := v_ledger_version_now <> v_ledger_version_at_count;

  update stock_count_attempts set movements_during_count = v_movements_during_count where id = v_attempt_id;

  select purchase_reference_unit_cost_without_vat into v_unit_cost from stock_items where id = v_item_id;

  v_absolute := p_counted_quantity - v_system_quantity;
  v_percent := case when v_system_quantity > 0 then abs(v_absolute) / abs(v_system_quantity) else null end;
  v_variance_value := case when v_unit_cost is not null then v_absolute * v_unit_cost else null end;

  v_breach := v_movements_during_count
    or (
      p_tolerance_snapshot is not null and (
        (p_tolerance_snapshot->>'absoluteQty' is not null and abs(v_absolute) > (p_tolerance_snapshot->>'absoluteQty')::numeric)
        or (p_tolerance_snapshot->>'percent' is not null and v_percent is not null and v_percent > (p_tolerance_snapshot->>'percent')::numeric)
        or (p_tolerance_snapshot->>'financialImpact' is not null and v_variance_value is not null and abs(v_variance_value) > (p_tolerance_snapshot->>'financialImpact')::numeric)
      )
    );

  v_new_status := case when v_breach then 'recount_required' else 'counted' end;

  update stock_count_lines
  set status = v_new_status,
      selected_attempt_id = v_attempt_id,
      final_counted_quantity = p_counted_quantity,
      final_system_quantity = v_system_quantity,
      final_variance = v_absolute,
      variance_percent = v_percent,
      variance_value = v_variance_value,
      tolerance_snapshot = p_tolerance_snapshot,
      locked_by = null,
      locked_at = null,
      version = version + 1
  where id = p_count_line_id
  returning version into v_line_version;

  return query select
    v_attempt_id, v_attempt_number, v_new_status, v_line_version,
    v_system_quantity, v_ledger_version_at_count,
    v_absolute, v_percent, v_variance_value, v_movements_during_count;
end;
$function$;

grant execute on function public.fn_stock_count_submit_attempt(uuid, uuid, integer, numeric, jsonb, text, timestamptz, jsonb, text)
  to public, "anon", "authenticated", "postgres", "service_role";

-- "Confirmar contagem e ajustar stock" — transação "tudo ou nada" (secção
-- 45). Lock otimista (versão obsoleta) e curto-circuito quando já
-- `completed` (idempotência do endpoint — retry/duplo-clique devolve o
-- resultado já existente, nunca duplica). Só considera linhas
-- `counted`/`resolved` com variância diferente de zero — a variância é
-- sempre gravada e sempre gera AJUSTE_CONTAGEM mesmo dentro da tolerância
-- (secção 34); zero é o único caso que nunca gera movimento.
create or replace function public.fn_stock_count_confirm(
  p_org_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_approved_by text,
  p_business_date date
)
  returns table (status text, version integer, movement_ids uuid[], already_completed boolean)
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_status text;
  v_version integer;
  v_location_id uuid;
  v_session_number bigint;
  v_line record;
  v_movement_ids uuid[] := '{}';
  v_movement_id uuid;
begin
  select status, version, location_id, session_number into v_status, v_version, v_location_id, v_session_number
  from stock_count_sessions
  where id = p_session_id and org_id = p_org_id
  for update;

  if v_status is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    select coalesce(array_agg(id), '{}') into v_movement_ids from stock_movements where count_session_id = p_session_id;
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
    select 1 from stock_count_lines
    where session_id = p_session_id and status in ('not_counted', 'recount_required')
  ) then
    raise exception 'not_ready' using errcode = 'P0003';
  end if;

  for v_line in
    select * from stock_count_lines
    where session_id = p_session_id and status in ('counted', 'resolved') and coalesce(final_variance, 0) <> 0
  loop
    insert into stock_movements (
      id, org_id, item_id, type, quantity, location_id,
      reason, reference, movement_date, effective_date, created_by,
      count_session_id, count_line_id
    )
    values (
      gen_random_uuid(), p_org_id, v_line.item_id, 'adjustment', v_line.final_variance, v_location_id,
      'Ajuste de contagem física', 'Contagem #' || v_session_number, p_business_date, p_business_date, p_approved_by,
      p_session_id, v_line.id
    )
    on conflict (count_session_id, count_line_id) where count_session_id is not null do nothing
    returning id into v_movement_id;

    if v_movement_id is not null then
      v_movement_ids := array_append(v_movement_ids, v_movement_id);
    end if;
  end loop;

  update stock_count_sessions
  set status = 'completed', approved_at = now(), approved_by = p_approved_by, version = version + 1
  where id = p_session_id
  returning status, version into v_status, v_version;

  return query select v_status, v_version, v_movement_ids, false;
end;
$function$;

grant execute on function public.fn_stock_count_confirm(uuid, uuid, integer, text, date)
  to public, "anon", "authenticated", "postgres", "service_role";
