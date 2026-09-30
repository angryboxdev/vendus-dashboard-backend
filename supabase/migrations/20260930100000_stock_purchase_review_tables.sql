-- Módulo Stock — "Compra por rever" (integração Financeiro→Stock). Uma
-- fatura existe uma única vez no sistema; esta tabela é só a referência ao
-- impacto físico, nunca uma segunda fatura. `invoice_id` UNIQUE — uma
-- fatura nunca tem duas revisões ativas (mesmo cancelada, não recria
-- automaticamente).

create table if not exists public.stock_purchase_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  invoice_id uuid not null references public.invoices(id),
  status text not null default 'pending' check (status in (
    'pending', 'in_review', 'partial', 'ready', 'applied', 'cancelled'
  )),
  -- Lock otimista (secção 33 da task) — dois gestores não podem sobrescrever
  -- silenciosamente o trabalho um do outro.
  version integer not null default 1,
  -- Snapshot para deteção de fatura alterada depois da revisão criada
  -- (secção 14) — nunca sobrescreve mapeamentos já feitos silenciosamente.
  source_invoice_version integer not null default 1,
  source_hash text not null,
  -- Snapshot da decisão (secção 9) — nunca recalculado retroativamente
  -- quando a configuração de categoria/fornecedor muda depois.
  decision_source text not null check (decision_source in ('override', 'category', 'supplier', 'unresolved')),
  decision_category_id uuid references public.cost_center_categories(id),
  decision_supplier_id uuid references public.suppliers(id),
  decision_policy_used text not null,
  decision_actor text,
  decision_override_reason text,
  decision_at timestamptz not null default now(),
  supplier_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  location_id uuid references public.locations(id),
  applied_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_purchase_reviews_invoice_unique unique (invoice_id)
);

create index if not exists stock_purchase_reviews_org_status_idx
  on public.stock_purchase_reviews (org_id, status);

alter table public.stock_purchase_reviews enable row level security;

drop policy if exists "stock_purchase_reviews: org-scoped all" on public.stock_purchase_reviews;
create policy "stock_purchase_reviews: org-scoped all"
  on public.stock_purchase_reviews
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Linhas físicas da revisão (secção 20) — nunca as mesmas linhas da fatura
-- financeira; `invoice_line_id` é só uma referência de leitura. ID próprio
-- estável, nunca a descrição do produto como identificador.
create table if not exists public.stock_review_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  review_id uuid not null references public.stock_purchase_reviews(id),
  invoice_line_id uuid not null references public.invoice_lines(id),
  description text not null,
  -- NUMERIC, nunca FLOAT, para quantidades/fatores/custos (secção 24).
  purchase_quantity numeric(18,6) not null check (purchase_quantity > 0),
  purchase_unit text not null,
  unit_cost_without_vat numeric(18,6) not null,
  total_with_vat numeric(18,6) not null,
  resolution_type text not null default 'unresolved' check (resolution_type in (
    'unresolved', 'existing_item', 'new_item', 'no_stock_effect'
  )),
  stock_item_id uuid references public.stock_items(id),
  conversion_factor numeric(18,6) check (conversion_factor > 0),
  stock_quantity numeric(18,6) check (stock_quantity > 0),
  location_id uuid references public.locations(id),
  unit_cost_per_base_unit_with_vat numeric(18,6),
  unit_cost_per_base_unit_without_vat numeric(18,6),
  flagged_suspicious_conversion boolean not null default false,
  flag_reason text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),

  constraint stock_review_lines_invoice_line_unique unique (invoice_line_id),
  constraint stock_review_lines_resolution_consistency check (
    (resolution_type = 'unresolved' and stock_item_id is null and conversion_factor is null)
    or (resolution_type in ('existing_item', 'new_item') and stock_item_id is not null and conversion_factor is not null and stock_quantity is not null)
    or (resolution_type = 'no_stock_effect' and stock_item_id is null and conversion_factor is null)
  )
);

create index if not exists stock_review_lines_review_idx on public.stock_review_lines (review_id);

alter table public.stock_review_lines enable row level security;

drop policy if exists "stock_review_lines: org-scoped all" on public.stock_review_lines;
create policy "stock_review_lines: org-scoped all"
  on public.stock_review_lines
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Mapeamento aprendido (secção 27) — procura por referência primeiro,
-- descrição normalizada como fallback. Nunca cria item novo sozinho, só
-- sugestão; invalidação de item entretanto inativo é feita em tempo de
-- leitura, nunca apagando a linha aprendida.
create table if not exists public.stock_review_learned_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id),
  supplier_reference text,
  normalized_description text not null,
  resolution_type text not null check (resolution_type in ('existing_item', 'no_stock_effect')),
  stock_item_id uuid references public.stock_items(id),
  conversion_factor numeric(18,6) check (conversion_factor > 0),
  purchase_unit text,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint stock_review_learned_mappings_reference_key unique (supplier_id, supplier_reference),
  constraint stock_review_learned_mappings_description_key unique (supplier_id, normalized_description)
);

alter table public.stock_review_learned_mappings enable row level security;

drop policy if exists "stock_review_learned_mappings: org-scoped all" on public.stock_review_learned_mappings;
create policy "stock_review_learned_mappings: org-scoped all"
  on public.stock_review_learned_mappings
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Auditoria (secção 44) — mesmo formato de `accounting_audit_logs`/`hr_audit_logs`.
create table if not exists public.stock_review_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('stock_purchase_review')),
  entity_id uuid not null,
  action text not null,
  actor text not null,
  payload_before jsonb,
  payload_after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists stock_review_audit_logs_entity_idx
  on public.stock_review_audit_logs (org_id, entity_type, entity_id, created_at);

alter table public.stock_review_audit_logs enable row level security;

drop policy if exists "stock_review_audit_logs: org-scoped all" on public.stock_review_audit_logs;
create policy "stock_review_audit_logs: org-scoped all"
  on public.stock_review_audit_logs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Idempotência do movimento (secção 35) — `purchase_review_id + review_line_id`
-- UNIQUE. `effective_date` separado de `created_at` (secção 38) — data
-- económica da fatura vs. momento real da confirmação.
alter table public.stock_movements
  add column if not exists purchase_review_id uuid references public.stock_purchase_reviews(id),
  add column if not exists review_line_id uuid references public.stock_review_lines(id),
  add column if not exists effective_date date;

create unique index if not exists stock_movements_review_line_unique
  on public.stock_movements (purchase_review_id, review_line_id)
  where purchase_review_id is not null;
