-- Rollback de 20261109100000_invoice_obligations.sql (ordem inversa).
-- Atenção: obrigações já criadas voltam a parecer faturas de compra (perdem tipo, referência e período);
-- valores, contas a pagar e anexos não são afetados.
drop index if exists public.invoices_org_obligation_reference_idx;
alter table public.invoices drop constraint if exists invoices_document_kind_check;
alter table public.invoices
  drop column if exists obligation_period,
  drop column if exists mb_entity,
  drop column if exists payment_reference,
  drop column if exists document_kind;
