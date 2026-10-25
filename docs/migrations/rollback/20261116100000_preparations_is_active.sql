-- Rollback de 20261116100000_preparations_is_active.sql: remove o estado ativo/inativo dos preparos
-- (os inativos voltam a aparecer como normais).

alter table public.preparations
  drop column if exists is_active;
