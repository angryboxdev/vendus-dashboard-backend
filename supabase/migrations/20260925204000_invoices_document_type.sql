alter table invoices
  add column if not exists document_type text not null default 'invoice'
    check (document_type in ('invoice', 'credit_note'));
