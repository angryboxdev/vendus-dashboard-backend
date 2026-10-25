-- Apresentação de compra por fornecedor e artigo (task «embalagens e conversões» P1/P2).
-- «Vem em saco? Quantos kg tem cada saco?» — por organização + fornecedor + referência do fornecedor
-- (ou descrição normalizada, sem referência) → artigo de Stock:
--   package_unit       saco | caixa | lata | garrafa | … | null = não vem em embalagem (vende-se ao peso/unidade)
--   content_quantity   + content_unit: o que tem cada embalagem (1 saco = 2,5 kg)
--   invoiced_by        'package' (a fatura conta sacos: «4,000» sacos) | 'content' (conta kg: «20,000» kg)
--   min/increment      encomenda mínima e incremento, em embalagens (1 saco, de 1 em 1)
-- Versões: alterar cria uma linha nova e fecha a anterior (superseded_at) — os movimentos antigos
-- nunca são recalculados. Origem e confiança registadas. Caixas/paletes não entram (sem significado).
-- Tabela nova, org-scoped (RLS org_id = current_org()). Idempotente.

create table if not exists public.supplier_purchase_presentations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id),
  -- 'ref:<referência>' ou 'desc:<descrição normalizada>' — uma apresentação ativa por chave.
  match_key text not null,
  supplier_reference text null,
  description text not null,
  stock_item_id uuid not null references public.stock_items(id),
  package_unit text null,
  content_quantity numeric(18,6) not null check (content_quantity > 0),
  content_unit text not null check (content_unit in ('g', 'kg', 'ml', 'cl', 'l', 'un')),
  invoiced_by text not null check (invoiced_by in ('package', 'content')),
  min_order_packages numeric(18,6) not null default 1 check (min_order_packages > 0),
  order_increment_packages numeric(18,6) not null default 1 check (order_increment_packages > 0),
  source text not null check (source in ('user', 'document', 'catalog')),
  confidence numeric(5,4) null,
  created_by text null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz null,
  constraint supplier_purchase_presentations_package_check check (package_unit is not null or invoiced_by = 'content')
);

create unique index if not exists supplier_purchase_presentations_active_key
  on public.supplier_purchase_presentations (org_id, supplier_id, match_key)
  where superseded_at is null;

create index if not exists supplier_purchase_presentations_item_idx
  on public.supplier_purchase_presentations (org_id, stock_item_id)
  where superseded_at is null;

alter table public.supplier_purchase_presentations enable row level security;

drop policy if exists "supplier_purchase_presentations: org-scoped all" on public.supplier_purchase_presentations;
create policy "supplier_purchase_presentations: org-scoped all"
  on public.supplier_purchase_presentations
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

comment on table public.supplier_purchase_presentations is 'Como um artigo vem de um fornecedor (saco de 2,5 kg; fatura em kg ou em sacos; encomenda mínima). Versões: superseded_at.';

-- Auditoria das apresentações na mesma tabela de auditoria do módulo (confirmada/alterada, antes/depois).
alter table public.stock_review_audit_logs drop constraint if exists stock_review_audit_logs_entity_type_check;
alter table public.stock_review_audit_logs
  add constraint stock_review_audit_logs_entity_type_check check (entity_type in ('stock_purchase_review', 'purchase_presentation'));
