-- Fornecedores/Financeiro/Stock v1.2 · F1 §1.3: motor único de valores.
-- Descontos (% ou €, por linha e global), valores extraídos vs. normalizados, quadro de IVA por taxa e a
-- "Diferença para a fatura". Colunas novas e opcionais: as faturas antigas ficam como estão (o antigo
-- subtotal líquido NÃO é renomeado como bruto; bruto/desconto antigos ficam a null = "não registado").

alter table public.invoice_lines
  add column if not exists quantity_text text null,
  add column if not exists unit_price_text text null,
  add column if not exists gross_cents bigint null,
  add column if not exists discount_kind text null check (discount_kind in ('pct', 'amount')),
  add column if not exists discount_value numeric(14, 4) null check (discount_value is null or discount_value >= 0),
  add column if not exists discount_cents bigint null check (discount_cents is null or discount_cents >= 0),
  add column if not exists global_discount_cents bigint null check (global_discount_cents is null or global_discount_cents >= 0),
  add column if not exists net_cents bigint null;

alter table public.invoices
  add column if not exists gross_cents bigint null,
  add column if not exists discount_cents bigint null,
  add column if not exists global_discount_kind text null check (global_discount_kind in ('pct', 'amount')),
  add column if not exists global_discount_value numeric(14, 4) null,
  add column if not exists footer_discount_cents bigint null,
  add column if not exists adjustments_cents bigint not null default 0,
  add column if not exists rounding_adjustment_cents bigint not null default 0,
  add column if not exists rounding_adjustment_reason text null,
  add column if not exists vat_summary jsonb null,
  add column if not exists difference_cents bigint null,
  add column if not exists amounts_validated_at timestamptz null;
alter table public.invoices
  drop constraint if exists invoices_rounding_reason_ck;
alter table public.invoices
  add constraint invoices_rounding_reason_ck check (rounding_adjustment_cents = 0 or length(btrim(coalesce(rounding_adjustment_reason, ''))) >= 5);
