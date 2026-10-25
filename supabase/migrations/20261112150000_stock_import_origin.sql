-- Financeiro/Stock v1.2 — F3c: importar a fatura diretamente no Stock.
-- * invoices.import_origin = 'stock' → rascunho criado pelo Stock, «Aguardando lançamento no
--   Financeiro» (sem conta a pagar até o Financeiro o lançar). Null = importação normal.
-- * stock_purchase_reviews.origin ('finance' | 'stock') e finance_pending: a revisão nascida no Stock
--   fica pendente do Financeiro; quando o Financeiro lança a mesma fatura, a criação da revisão
--   (idempotente por fatura) limpa a pendência em vez de criar outra — nunca repete quantidades.
-- Só colunas novas e a função recriada com a mesma assinatura. Idempotente.

alter table public.invoices
  add column if not exists import_origin text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_import_origin_check') then
    alter table public.invoices add constraint invoices_import_origin_check check (import_origin is null or import_origin in ('stock'));
  end if;
end $$;

comment on column public.invoices.import_origin is 'stock = importada no Stock (F3c), aguarda lançamento no Financeiro enquanto for rascunho.';

alter table public.stock_purchase_reviews
  add column if not exists origin text not null default 'finance',
  add column if not exists finance_pending boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_purchase_reviews_origin_check') then
    alter table public.stock_purchase_reviews add constraint stock_purchase_reviews_origin_check check (origin in ('finance', 'stock'));
  end if;
end $$;

comment on column public.stock_purchase_reviews.finance_pending is 'Importada no Stock e ainda não lançada no Financeiro (F3c). Não é liquidação nem saldo.';

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
  v_origin text := coalesce(nullif(p_review->>'origin', ''), 'finance');
begin
  insert into stock_purchase_reviews (
    org_id, invoice_id, source_invoice_version, source_hash,
    decision_source, decision_category_id, decision_supplier_id,
    decision_policy_used, decision_actor, decision_override_reason,
    supplier_name, invoice_number, invoice_date,
    invoice_net_cents, invoice_vat_cents, invoice_total_cents,
    origin, finance_pending
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
    nullif(p_review->>'invoice_total_cents', '')::bigint,
    v_origin,
    v_origin = 'stock'
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
    select spr.id into v_review_id from stock_purchase_reviews spr
    where spr.invoice_id = p_invoice_id and spr.org_id = p_org_id;
    -- O Financeiro lançou a fatura que o Stock importou: acaba a pendência (sem nova revisão).
    if v_origin = 'finance' then
      update stock_purchase_reviews spr set finance_pending = false, updated_at = now()
      where spr.id = v_review_id and spr.finance_pending;
    end if;
  end if;

  return query select v_review_id, v_created_now;
end;
$function$;

grant execute on function public.fn_stock_review_create_from_invoice(uuid, uuid, jsonb, jsonb)
  to public, "anon", "authenticated", "postgres", "service_role";
