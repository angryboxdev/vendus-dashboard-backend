-- Importador dos extratos das plataformas, F2 (.scratch/importador-plataformas/spec.md): o SAF-T de
-- vendas do AirMenu (as três plataformas juntas, para conferência) guarda-se na mesma tabela com a
-- origem 'airmenu'.
-- Idempotente. Rollback: docs/migrations/rollback/20261206100000_delivery_platform_statements_airmenu.sql

alter table public.delivery_platform_statements
  drop constraint if exists delivery_platform_statements_platform_check;

alter table public.delivery_platform_statements
  add constraint delivery_platform_statements_platform_check
  check (platform in ('uber_eats', 'glovo', 'bolt_food', 'airmenu'));
