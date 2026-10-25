-- Rollback de 20261112100000_supplier_supply_rules.sql. Perde as regras por dia (pedido até,
-- observações) e a encomenda mínima; os dias de entrega e a hora limite geral mantêm-se.
alter table public.supplier_delivery_schedules drop constraint if exists supplier_delivery_schedules_day_rules_is_array;
alter table public.supplier_delivery_schedules drop column if exists day_rules;
alter table public.suppliers drop constraint if exists suppliers_min_order_value_non_negative;
alter table public.suppliers drop column if exists min_order_value_cents;
