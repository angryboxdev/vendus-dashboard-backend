-- Migration: invoices — reconciliation_status, line_detail_mode, payment_bank_account_id, competence_date
-- Aplica os campos necessários para separar pagamento de conciliação bancária (BF-08/MF-04)
-- e controlar o modo de linhas de fatura (MF-09/BF-05).

-- Estado de conciliação bancária
-- none                = fatura não paga ou DD ainda não processado
-- pending_reconciliation = fatura paga no sistema mas ainda não confirmada no extrato
-- reconciled          = pagamento confirmado no extrato bancário
alter table invoices
  add column if not exists reconciliation_status text not null default 'none'
    check (reconciliation_status in ('none', 'pending_reconciliation', 'reconciled'));

-- Conta bancária utilizada no pagamento (referência opcional — FK opcional para futura tabela bank_accounts)
alter table invoices
  add column if not exists payment_bank_account_id uuid;

-- Modo de linhas: simple = linha única automática bloqueada; detailed = detalhamento editável
alter table invoices
  add column if not exists line_detail_mode text not null default 'simple'
    check (line_detail_mode in ('simple', 'detailed'));

-- Data de competência (base para DRE gerencial por competência)
alter table invoices
  add column if not exists competence_date date;

-- Retrocompatibilidade: faturas já pagas que existiam antes desta migration
-- ficam com reconciliation_status = 'none' (comportamento neutro)
-- O operador pode reconciliar manualmente via PATCH /invoices/:id/reconcile
-- ou através da conciliação bancária quando implementada.

-- Índice para filtros por estado de conciliação
create index if not exists idx_invoices_reconciliation_status
  on invoices (reconciliation_status);
