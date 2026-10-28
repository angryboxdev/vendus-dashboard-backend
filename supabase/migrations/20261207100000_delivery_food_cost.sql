-- Importador das plataformas, F5 — custo real da comida e da embalagem do delivery
-- (.scratch/importador-plataformas/spec.md):
-- 1. `products` no extrato: vendas por produto e por dia do SAF-T do AirMenu (código, descrição,
--    quantidade, valor sem IVA). Nunca clientes.
-- 2. `delivery_product_mappings`: a que corresponde cada produto do AirMenu (ficha técnica e tamanho,
--    artigo de stock, «Upgrade para L» ou ignorar) e os artigos da embalagem (chaves reservadas
--    «@box_small», «@box_large», «@bag», «@napkin»). Um por empresa e produto.
-- Idempotente. Rollback: docs/migrations/rollback/20261207100000_delivery_food_cost.sql

alter table public.delivery_platform_statements
  add column if not exists products jsonb not null default '[]'::jsonb;

create table if not exists public.delivery_product_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  -- Descrição do produto normalizada (ou chave reservada da embalagem).
  product_key text not null,
  product_code text null,
  product_description text not null,
  target_type text not null,
  pizza_id uuid null,
  size text null,
  stock_item_id uuid null,
  updated_by text null,
  updated_at timestamptz not null default now(),
  constraint delivery_product_mappings_key unique (org_id, product_key),
  constraint delivery_product_mappings_type_check check (target_type in ('dish', 'item', 'upgrade_large', 'ignore')),
  constraint delivery_product_mappings_target_check check (
    (target_type = 'dish' and pizza_id is not null and size is not null)
    or (target_type = 'item' and stock_item_id is not null)
    or target_type in ('upgrade_large', 'ignore')
  )
);

alter table public.delivery_product_mappings enable row level security;
drop policy if exists "delivery_product_mappings: org-scoped all" on public.delivery_product_mappings;
create policy "delivery_product_mappings: org-scoped all"
  on public.delivery_product_mappings
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
