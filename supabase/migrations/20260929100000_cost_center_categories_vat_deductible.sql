-- Módulo Contabilidade (Fase 1) — "IVA não dedutível" nunca é uma regra
-- fiscal calculada automaticamente: é uma decisão manual do gestor, por
-- subcategoria de centro de custo, mesmo padrão de affects_dre/
-- affects_cashflow/affects_profitability já existentes nesta tabela.
-- Default true (dedutível) — nunca marca nada como não dedutível sozinho.

alter table public.cost_center_categories
  add column if not exists vat_deductible boolean not null default true;

comment on column public.cost_center_categories.vat_deductible is
  'Se o IVA desta subcategoria é dedutível. Configurável manualmente pelo gestor — nunca inferido de uma regra fiscal automática. Default true.';
