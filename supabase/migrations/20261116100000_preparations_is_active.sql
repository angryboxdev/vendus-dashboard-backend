-- Preparos ativos/inativos (fichas técnicas): inativar em vez de apagar (ex.: brigadeiro fora da carta).
-- Um preparo inativo deixa de aparecer para adicionar a receitas; as receitas que já o usam continuam
-- a custear e a descontar stock. Idempotente.
-- Rollback: docs/migrations/rollback/20261116100000_preparations_is_active.sql

alter table public.preparations
  add column if not exists is_active boolean not null default true;
