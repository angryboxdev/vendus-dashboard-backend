-- Migration: invoices — payment_method, payment_notes
-- Campos para registar o método de pagamento e observação ao marcar fatura como paga.
-- Necessário para o MarkPaidModal enriquecido (Tarefa 1 da especificação).

-- Método de pagamento utilizado (ex.: 'bank_transfer', 'direct_debit', 'mbway', 'card', 'cash', 'cheque', 'other')
alter table invoices
  add column if not exists payment_method text;

-- Observação livre registada no momento do pagamento (max 200 chars sugerido na UI)
alter table invoices
  add column if not exists payment_notes text;
