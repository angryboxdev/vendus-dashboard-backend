-- Mapeamento persistente entre artigos de fornecedor e itens de stock.
-- Chave: (supplier_normalized, supplier_article_code)
-- Atualizado automaticamente quando o utilizador confirma um import e associa
-- um artigo da fatura a um item de stock.

create table if not exists public.supplier_article_mappings (
  id                          uuid        primary key default gen_random_uuid(),
  supplier_normalized         text        not null,
  supplier_article_code       text        not null,
  supplier_article_description text,
  stock_item_id               uuid        not null references public.stock_items(id) on delete cascade,
  -- Multiplicador de unidade: quantidade em stock = quantidade_fatura × este valor.
  -- Ex.: 1 PC (pack de 10 un) → quantity_per_invoice_unit = 10
  -- Ex.: 500 g → stock em kg → quantity_per_invoice_unit = 0.001
  quantity_per_invoice_unit   numeric     not null default 1,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (supplier_normalized, supplier_article_code)
);

comment on table  public.supplier_article_mappings                          is 'Mapeamento persistente entre artigos de fornecedor (código + descrição) e itens de stock';
comment on column public.supplier_article_mappings.supplier_normalized      is 'Nome do fornecedor normalizado (lowercase, trim) — usado como chave de lookup';
comment on column public.supplier_article_mappings.supplier_article_code    is 'Código do artigo na fatura do fornecedor (ex.: 019000)';
comment on column public.supplier_article_mappings.supplier_article_description is 'Descrição do artigo na última fatura em que foi mapeado (informativo)';
comment on column public.supplier_article_mappings.stock_item_id            is 'Item de stock para o qual este artigo do fornecedor é mapeado';
comment on column public.supplier_article_mappings.quantity_per_invoice_unit is 'Fator de conversão de unidades: stock_qty = invoice_qty × este valor (ex.: 10 para pack de 10 un, 0.001 para g→kg)';

create index if not exists supplier_article_mappings_supplier_idx
  on public.supplier_article_mappings (supplier_normalized, supplier_article_code);
