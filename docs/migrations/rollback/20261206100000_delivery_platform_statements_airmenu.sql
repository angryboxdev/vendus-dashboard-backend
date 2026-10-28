-- Rollback de 20261206100000_delivery_platform_statements_airmenu.sql: apaga os SAF-T importados e
-- volta a aceitar só as três plataformas.

delete from public.delivery_platform_statements where platform = 'airmenu';

alter table public.delivery_platform_statements
  drop constraint if exists delivery_platform_statements_platform_check;

alter table public.delivery_platform_statements
  add constraint delivery_platform_statements_platform_check
  check (platform in ('uber_eats', 'glovo', 'bolt_food'));
