-- Adiciona use_as_unit à tabela preparations.
-- use_as_unit = true  → usado nas receitas em unidades (1 un = 1 execução completa do preparo).
-- use_as_unit = false → usado nas receitas na unidade de rendimento (g, ml, …); quantity representa
--                       uma quantidade parcial que é dividida por yield_qty para obter o factor.

alter table public.preparations
  add column use_as_unit boolean not null default false;

comment on column public.preparations.use_as_unit is
  'true → quantity na receita representa unidades (1 = execução completa); false → quantity representa uma quantidade parcial dividida por yield_qty';
