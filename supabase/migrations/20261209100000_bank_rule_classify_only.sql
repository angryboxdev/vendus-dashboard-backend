-- Classificar sem conciliar (.scratch/classificar-movimentos/spec.md): um «movimento recorrente» (regra)
-- pode só classificar (categoria para a DRE; o movimento fica à espera da fatura) em vez de justificar.
-- Idempotente. Rollback: docs/migrations/rollback/20261209100000_bank_rule_classify_only.sql

alter table public.bank_reconciliation_rules
  add column if not exists classify_only boolean not null default false;
