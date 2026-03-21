-- Custo de compra opcional no catálogo (coluna única legada).
-- A migração 016 substitui por purchase_reference_unit_cost_with_vat / _without_vat e remove esta coluna.
alter table public.stock_items
  add column if not exists purchase_reference_unit_cost numeric(14, 6);

comment on column public.stock_items.purchase_reference_unit_cost is
  'Custo por base_unit no catálogo (opcional): ex. preço ao criar o item antes da 1.ª compra. NULL = não definido. Não é média: o custo operacional é o da última purchase em stock_movements; este campo só faz fallback quando ainda não há compra com custo.';
