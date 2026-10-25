-- Financeiro/Stock v1.2 — F3a: revisão com as linhas reais e conferências.
-- * Linhas da revisão guardam o IVA da linha (líquido = total − IVA, já com descontos), a
--   referência do fornecedor, a categoria financeira (snapshot) e a divisão por lojas.
-- * Revisão guarda os totais da fatura (conferência do documento), as divergências de
--   categoria encontradas ao confirmar (pendência para o Financeiro) e o estado 'excluded'
--   («Excluída — não afeta Stock», sem movimentos).
-- * Um movimento por linha e loja (divisão por lojas); continua idempotente.
-- Só colunas novas e funções recriadas com a mesma assinatura. Idempotente.

alter table public.stock_review_lines
  add column if not exists vat_amount numeric(18,6) null,
  add column if not exists supplier_item_code text null,
  add column if not exists cost_center_category_id uuid null references public.cost_center_categories(id),
  add column if not exists location_splits jsonb null;

comment on column public.stock_review_lines.vat_amount is 'IVA da linha (mesma unidade de total_with_vat). Líquido com descontos = total_with_vat − vat_amount. Null em revisões anteriores à F3a.';
comment on column public.stock_review_lines.location_splits is 'Divisão por lojas: [{"location_id": uuid, "purchase_quantity": n}] — a soma iguala purchase_quantity; null = uma só loja (location_id).';

alter table public.stock_purchase_reviews
  add column if not exists invoice_net_cents bigint null,
  add column if not exists invoice_vat_cents bigint null,
  add column if not exists invoice_total_cents bigint null,
  add column if not exists category_divergences jsonb null;

comment on column public.stock_purchase_reviews.category_divergences is 'Divergências de categoria registadas ao confirmar (não bloqueiam a entrada; pendência para o Financeiro).';

alter table public.stock_purchase_reviews drop constraint if exists stock_purchase_reviews_status_check;
alter table public.stock_purchase_reviews
  add constraint stock_purchase_reviews_status_check check (status in (
    'pending', 'in_review', 'partial', 'ready', 'applied', 'cancelled', 'excluded'
  ));

-- IVA das linhas de revisões ainda por aplicar (a partir da linha da fatura).
update public.stock_review_lines srl
set vat_amount = il.vat_amount
from public.invoice_lines il, public.stock_purchase_reviews spr
where srl.invoice_line_id = il.id
  and spr.id = srl.review_id
  and srl.vat_amount is null
  and spr.status not in ('applied', 'cancelled', 'excluded');

-- Um movimento por (revisão, linha, loja).
drop index if exists public.stock_movements_review_line_unique;
create unique index if not exists stock_movements_review_line_location_unique
  on public.stock_movements (purchase_review_id, review_line_id, location_id)
  where purchase_review_id is not null;

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
    supplier_name, invoice_number, invoice_date,
    invoice_net_cents, invoice_vat_cents, invoice_total_cents
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
    (p_review->>'invoice_date')::date,
    nullif(p_review->>'invoice_net_cents', '')::bigint,
    nullif(p_review->>'invoice_vat_cents', '')::bigint,
    nullif(p_review->>'invoice_total_cents', '')::bigint
  )
  on conflict (invoice_id) do nothing
  returning id into v_review_id;

  if v_review_id is not null then
    v_created_now := true;

    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      insert into stock_review_lines (
        org_id, review_id, invoice_line_id, description,
        purchase_quantity, purchase_unit, unit_cost_without_vat, total_with_vat,
        vat_amount, supplier_item_code, cost_center_category_id, location_id
      )
      values (
        p_org_id, v_review_id,
        (v_line->>'invoice_line_id')::uuid,
        v_line->>'description',
        (v_line->>'purchase_quantity')::numeric,
        v_line->>'purchase_unit',
        (v_line->>'unit_cost_without_vat')::numeric,
        (v_line->>'total_with_vat')::numeric,
        nullif(v_line->>'vat_amount', '')::numeric,
        nullif(v_line->>'supplier_item_code', ''),
        nullif(v_line->>'cost_center_category_id', '')::uuid,
        nullif(v_line->>'location_id', '')::uuid
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
