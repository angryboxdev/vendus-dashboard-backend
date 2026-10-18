-- Fornecedores/Financeiro/Stock v1.2 · F2 §2.2: três modos de classificação financeira.
-- line_detail_mode: simple = «Única», detailed = «Por artigo», by_values = «Por valores» (novo).
-- invoice_allocations: repartições financeiras do modo «Por valores» (CC/subcategoria, loja, montante
-- líquido). Nunca são artigos nem substituem as linhas do documento (invoice_lines).

alter table public.invoices drop constraint if exists invoices_line_detail_mode_check;
alter table public.invoices
  add constraint invoices_line_detail_mode_check check (line_detail_mode in ('simple', 'detailed', 'by_values'));

create table if not exists public.invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  invoice_id uuid not null,
  position integer not null default 0,
  description text not null check (length(btrim(description)) between 1 and 200),
  cost_center_group_id uuid null,
  cost_center_category_id uuid not null,
  location_id uuid null,
  -- Montante líquido (sem IVA, já depois de descontos), em cêntimos; magnitude positiva.
  net_cents bigint not null check (net_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_allocations_org_id_uq unique (org_id, id),
  constraint invoice_allocations_invoice_fk foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete cascade,
  constraint invoice_allocations_group_fk foreign key (org_id, cost_center_group_id) references public.cost_center_groups (org_id, id),
  constraint invoice_allocations_category_fk foreign key (org_id, cost_center_category_id) references public.cost_center_categories (org_id, id),
  constraint invoice_allocations_location_fk foreign key (org_id, location_id) references public.locations (org_id, id)
);
create index if not exists invoice_allocations_invoice_idx on public.invoice_allocations (org_id, invoice_id, position);

alter table public.invoice_allocations enable row level security;
drop policy if exists "invoice_allocations: org-scoped all" on public.invoice_allocations;
create policy "invoice_allocations: org-scoped all" on public.invoice_allocations
  for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
