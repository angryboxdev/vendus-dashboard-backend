-- Rollback de 20261030130000_payable_entries_one_active_per_invoice.sql (remove só o índice).
drop index if exists public.payable_entries_one_active_per_invoice;
