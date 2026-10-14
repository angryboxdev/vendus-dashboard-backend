-- Rollback de 20261030120000_supplier_invoice_imports_supplier_nif.sql (perde os NIF extraídos).
alter table public.supplier_invoice_imports drop column if exists supplier_nif;
