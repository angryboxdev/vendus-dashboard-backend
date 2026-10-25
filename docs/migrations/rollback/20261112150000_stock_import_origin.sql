-- Rollback de 20261112150000_stock_import_origin.sql (ordem inversa).
-- Perde-se a origem «Stock» das faturas/revisões e a pendência do Financeiro; rascunhos importados
-- no Stock continuam como rascunhos normais e as revisões ficam como estão (sem movimentos tocados).
alter table public.stock_purchase_reviews drop constraint if exists stock_purchase_reviews_origin_check;
alter table public.stock_purchase_reviews
  drop column if exists finance_pending,
  drop column if exists origin;
alter table public.invoices drop constraint if exists invoices_import_origin_check;
alter table public.invoices drop column if exists import_origin;

-- Função como em 20261110100000_stock_review_f3a.sql:
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
