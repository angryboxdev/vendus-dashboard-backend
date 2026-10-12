-- Rollback de 20261022100000_novo_rh_clock_correction_levels.sql
-- Perde a informação de níveis dos pedidos de correção (o pedido em si mantém-se).
alter table public.clock_correction_requests drop constraint if exists clock_correction_requests_current_level_ck;
alter table public.clock_correction_requests
  drop column if exists current_level,
  drop column if exists levels;
