-- Fornecedores/Financeiro/Stock v1.2 · F2 §2.1: predefinições e encaminhamento na ficha do fornecedor.
-- Aditivo: colunas novas opcionais, uma política nova («Decidir no documento») e exceções por loja.
-- Nada é aplicado retroativamente a faturas já lançadas.

alter table public.suppliers
  add column if not exists default_financial_mode text null
    check (default_financial_mode in ('single', 'by_item', 'by_values')),
  add column if not exists default_location_id uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_default_location_fk') then
    alter table public.suppliers
      add constraint suppliers_default_location_fk foreign key (org_id, default_location_id)
      references public.locations (org_id, id) on delete set null (default_location_id);
  end if;
end $$;

-- «Enviar por defeito» = usually_creates_review, «Não enviar» = usually_skips_review,
-- «Decidir no documento» = decide_per_document (exige escolha explícita no lançamento),
-- «Seguir a categoria» = inherit (comportamento anterior).
alter table public.suppliers drop constraint if exists suppliers_default_stock_policy_check;
alter table public.suppliers
  add constraint suppliers_default_stock_policy_check
  check (default_stock_policy in ('inherit', 'usually_creates_review', 'usually_skips_review', 'decide_per_document'));

-- Exceções por loja: prevalecem sobre a regra geral do fornecedor para essa loja.
create table if not exists public.supplier_location_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  supplier_id uuid not null,
  location_id uuid not null,
  stock_policy text null
    check (stock_policy in ('inherit', 'usually_creates_review', 'usually_skips_review', 'decide_per_document')),
  cost_center_group_id uuid null,
  cost_center_category_id uuid null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_location_rules_org_id_uq unique (org_id, id),
  constraint supplier_location_rules_one_per_location unique (org_id, supplier_id, location_id),
  constraint supplier_location_rules_supplier_fk foreign key (org_id, supplier_id) references public.suppliers (org_id, id) on delete cascade,
  constraint supplier_location_rules_location_fk foreign key (org_id, location_id) references public.locations (org_id, id) on delete cascade,
  constraint supplier_location_rules_group_fk foreign key (org_id, cost_center_group_id) references public.cost_center_groups (org_id, id) on delete set null (cost_center_group_id),
  constraint supplier_location_rules_category_fk foreign key (org_id, cost_center_category_id) references public.cost_center_categories (org_id, id) on delete set null (cost_center_category_id),
  constraint supplier_location_rules_not_empty check (stock_policy is not null or cost_center_category_id is not null)
);
create index if not exists supplier_location_rules_supplier_idx on public.supplier_location_rules (org_id, supplier_id);

alter table public.supplier_location_rules enable row level security;
drop policy if exists "supplier_location_rules: org-scoped all" on public.supplier_location_rules;
create policy "supplier_location_rules: org-scoped all" on public.supplier_location_rules
  for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
