-- Fornecedor → separador «Abastecimento»: regras por dia de entrega e encomenda mínima.
-- Só colunas novas e opcionais (os calendários existentes ficam como estavam). Idempotente.

-- Por dia de entrega: dia/hora limite do pedido e uma observação.
-- Formato: [{ "weekday": 1-7, "orderWeekday": 1-7 | null, "orderTime": "HH:mm" | null, "notes": text | null }]
alter table public.supplier_delivery_schedules
  add column if not exists day_rules jsonb not null default '[]'::jsonb;

alter table public.supplier_delivery_schedules
  drop constraint if exists supplier_delivery_schedules_day_rules_is_array;
alter table public.supplier_delivery_schedules
  add constraint supplier_delivery_schedules_day_rules_is_array check (jsonb_typeof(day_rules) = 'array');

comment on column public.supplier_delivery_schedules.day_rules is 'Regras por dia de entrega: dia/hora limite do pedido e observação (informativo).';

-- Valor mínimo de encomenda, em cêntimos (como os valores das faturas).
alter table public.suppliers
  add column if not exists min_order_value_cents bigint null;

alter table public.suppliers
  drop constraint if exists suppliers_min_order_value_non_negative;
alter table public.suppliers
  add constraint suppliers_min_order_value_non_negative check (min_order_value_cents is null or min_order_value_cents >= 0);

comment on column public.suppliers.min_order_value_cents is 'Valor mínimo de encomenda configurado (cêntimos).';
