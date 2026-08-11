-- Adiciona o valor 'partially_reconciled' ao CHECK constraint de invoices.reconciliation_status
alter table invoices
  drop constraint if exists invoices_reconciliation_status_check,
  add constraint invoices_reconciliation_status_check
    check (reconciliation_status in (
      'none', 'pending_reconciliation', 'partially_reconciled', 'reconciled'
    ));
