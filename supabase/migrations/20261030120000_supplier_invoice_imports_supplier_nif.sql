-- Fornecedores/Financeiro/Stock v1.2 · F1: o import legado do Stock passa a guardar o NIF do emitente,
-- para usar a identidade fiscal partilhada com o Financeiro (sem NIF não se movimenta stock).
alter table public.supplier_invoice_imports add column if not exists supplier_nif text null;
