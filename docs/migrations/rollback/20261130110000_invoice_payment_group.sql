-- Rollback de 20261130110000_invoice_payment_group.sql
-- As faturas ficam; perde-se só a ligação entre as do mesmo documento de pagamento.
-- Fazer antes o rollback do código (a API lê/escreve esta coluna).

drop index if exists public.idx_invoices_org_id_payment_group_id;

alter table public.invoices
  drop column if exists payment_group_id;
