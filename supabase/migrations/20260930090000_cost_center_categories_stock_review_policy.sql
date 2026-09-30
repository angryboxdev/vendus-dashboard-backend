-- Módulo Stock (Compra por rever) — política de impacto físico por
-- subcategoria financeira. Nunca decidida pelo Centro de Custo (proibido
-- explicitamente pela task de integração Financeiro→Stock); `UNDEFINED`
-- cai para a preferência do fornecedor, nunca decide sozinha.

alter table public.cost_center_categories
  add column if not exists stock_review_policy text not null default 'UNDEFINED'
    check (stock_review_policy in ('CREATE_REVIEW', 'NO_STOCK_EFFECT', 'UNDEFINED'));

comment on column public.cost_center_categories.stock_review_policy is
  'CREATE_REVIEW = gera Compra por rever; NO_STOCK_EFFECT = nunca gera; UNDEFINED = cai para a preferência do fornecedor. Configurável manualmente, nunca inferido.';
