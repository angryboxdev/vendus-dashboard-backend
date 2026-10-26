-- Documentos de pagamento com várias faturas fiscais (ex.: águas: água/saneamento + resíduos, dois
-- emitentes, dois QR, um só débito). A importação cria uma fatura por QR e marca-as com o mesmo
-- payment_group_id — a recorrência e a conciliação tratam o grupo como um pagamento.
-- Idempotente. Rollback: docs/migrations/rollback/20261130110000_invoice_payment_group.sql

alter table public.invoices
  add column if not exists payment_group_id uuid;

create index if not exists idx_invoices_org_id_payment_group_id
  on public.invoices (org_id, payment_group_id)
  where payment_group_id is not null;
