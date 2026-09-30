-- Módulo Stock (Compra por rever) — preferência complementar do
-- fornecedor. Nunca pode ignorar uma classificação financeira explícita
-- (CREATE_REVIEW/NO_STOCK_EFFECT na categoria) — só entra quando a
-- categoria é UNDEFINED.

alter table public.suppliers
  add column if not exists default_stock_policy text not null default 'inherit'
    check (default_stock_policy in ('inherit', 'usually_creates_review', 'usually_skips_review'));

comment on column public.suppliers.default_stock_policy is
  'Preferência complementar de impacto em stock — só usada quando a categoria/subcategoria da fatura é UNDEFINED. Nunca decide sozinha contra uma categoria explícita.';
