-- Regras de entrada no Stock por tipo de artigo (task «Stock inteligente» V4 §2).
-- Por empresa: cada tipo de artigo (o mesmo enum de stock_items.type, mais «unknown» = ainda sem
-- artigo) diz se entra no inventário (stock), fica fora (no_stock) ou fica para rever (review).
-- Sem linha = predefinição da aplicação (Ingredientes/Bebidas/Embalagens: stock; Higiene/Limpeza:
-- fora; Consumíveis/Outros/Desconhecidos: por rever). Só afeta faturas futuras; o Tipo de artigo
-- controla o inventário, a Categoria financeira classifica o custo. Tabela nova, org-scoped. Idempotente.

create table if not exists public.stock_entry_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  item_type text not null check (item_type in ('ingredient', 'beverage', 'packaging', 'cleaning', 'consumable', 'other', 'unknown')),
  mode text not null check (mode in ('stock', 'no_stock', 'review')),
  updated_by text null,
  updated_at timestamptz not null default now(),
  constraint stock_entry_rules_org_type_key unique (org_id, item_type)
);

alter table public.stock_entry_rules enable row level security;

drop policy if exists "stock_entry_rules: org-scoped all" on public.stock_entry_rules;
create policy "stock_entry_rules: org-scoped all"
  on public.stock_entry_rules
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

comment on table public.stock_entry_rules is 'Regras de entrada no Stock por tipo de artigo (por empresa). Sem linha = predefinição.';

-- Auditoria das alterações às regras na tabela de auditoria do módulo.
alter table public.stock_review_audit_logs drop constraint if exists stock_review_audit_logs_entity_type_check;
alter table public.stock_review_audit_logs
  add constraint stock_review_audit_logs_entity_type_check check (entity_type in ('stock_purchase_review', 'purchase_presentation', 'stock_entry_rules'));
