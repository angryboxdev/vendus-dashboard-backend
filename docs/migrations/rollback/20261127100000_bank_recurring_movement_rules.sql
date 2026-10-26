-- Rollback de 20261127100000_bank_recurring_movement_rules.sql
-- Os movimentos conciliados por regras mantêm a classificação (justificação, centro de custo, fornecedor, IVA);
-- perde-se só a ligação à regra e os campos novos das regras (conta, valor fixo, fornecedor, IVA).
-- Fazer antes o rollback do código (a API escreve estas colunas).

drop index if exists public.idx_bank_movements_org_id_classified_by_rule_id;
drop index if exists public.idx_bank_reconciliation_rules_org_id_bank_account_id;

alter table public.bank_movements
  drop constraint if exists bank_movements_org_id_classified_by_rule_id_fkey;

alter table public.bank_movements
  drop column if exists classified_by_rule_id;

alter table public.bank_reconciliation_rules
  drop constraint if exists bank_reconciliation_rules_amount_check,
  drop constraint if exists bank_reconciliation_rules_org_id_supplier_id_fkey,
  drop constraint if exists bank_reconciliation_rules_org_id_bank_account_id_fkey,
  drop constraint if exists bank_reconciliation_rules_org_id_id_key;

alter table public.bank_reconciliation_rules
  drop column if exists vat_included,
  drop column if exists vat_rate,
  drop column if exists supplier_id,
  drop column if exists amount_tolerance_cents,
  drop column if exists amount_cents,
  drop column if exists bank_account_id;
