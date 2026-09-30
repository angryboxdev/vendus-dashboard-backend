-- Módulo Stock — Contagem Física de Stock 2.0 (engine genérica de
-- inventário físico, conferência de variâncias e ajustes auditáveis).
-- Mesmo padrão já estabelecido nesta sessão para `stock-purchase-review`:
-- RLS `current_org()`, `drop policy if exists` antes de `create policy`,
-- `if not exists` em todo o lado.

-- Sessão de Contagem — aggregate root. Estados exatamente
-- `draft|counting|reviewing|ready|completed|cancelled` (secção 10 — sem
-- "Parcial", sem "Recontagem necessária" ao nível da sessão).
create table if not exists public.stock_count_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  type text not null check (type in ('general', 'cyclical', 'spot')),
  -- Número legível usado na referência do movimento de ajuste ("Contagem #N").
  session_number bigint generated always as identity,
  status text not null default 'draft' check (status in (
    'draft', 'counting', 'reviewing', 'ready', 'completed', 'cancelled'
  )),
  -- Escopo antes de materializar (secção 5/12) — categorias/zonas/itens
  -- selecionados. `zoneIds` é só informativo nesta ronda (ver README).
  scope_definition jsonb not null default '{}'::jsonb,
  -- Snapshot do StockCountSettings no momento da criação — nunca uma
  -- referência viva (secção 4).
  blind_count boolean not null default true,
  business_date date not null,
  started_at timestamptz,
  started_by text,
  review_started_at timestamptz,
  ready_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Lock otimista (secção 33 da task original) — dois gestores não podem
  -- sobrescrever silenciosamente o trabalho um do outro.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_count_sessions_org_status_idx on public.stock_count_sessions (org_id, status);
create index if not exists stock_count_sessions_org_location_idx on public.stock_count_sessions (org_id, location_id);

alter table public.stock_count_sessions enable row level security;

drop policy if exists "stock_count_sessions: org-scoped all" on public.stock_count_sessions;
create policy "stock_count_sessions: org-scoped all"
  on public.stock_count_sessions
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Zonas — puramente organizacionais (secção 5/25/55), nunca uma dimensão de
-- saldo de stock independente. CRUD simples, sem hierarquia.
create table if not exists public.stock_count_zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_count_zones_org_location_idx on public.stock_count_zones (org_id, location_id);

alter table public.stock_count_zones enable row level security;

drop policy if exists "stock_count_zones: org-scoped all" on public.stock_count_zones;
create policy "stock_count_zones: org-scoped all"
  on public.stock_count_zones
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Linhas — uma por item (secção 11). Estados exatamente
-- `not_counted|counted|recount_required|resolved`.
-- `selected_attempt_id` referencia `stock_count_attempts`, criada a seguir
-- (ciclo resolvido com um `alter table` mais abaixo — mesma técnica usada
-- quando duas tabelas se referenciam mutuamente).
create table if not exists public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  session_id uuid not null references public.stock_count_sessions(id),
  item_id uuid not null references public.stock_items(id),
  status text not null default 'not_counted' check (status in (
    'not_counted', 'counted', 'recount_required', 'resolved'
  )),
  selected_attempt_id uuid,
  -- NUMERIC, nunca FLOAT (secção 24). `null` = "não contado" (empty ≠
  -- zero, secção 15) — nunca coagido para 0 em nenhuma camada.
  final_counted_quantity numeric(18,6),
  final_system_quantity numeric(18,6),
  final_variance numeric(18,6),
  -- `null` sempre que o teórico é <= 0 (secção 18) — nunca Infinity/NaN.
  variance_percent numeric(12,6),
  -- `null` sempre que não há custo unitário confiável no item (secção 39).
  variance_value numeric(18,6),
  -- Política resolvida no momento da tentativa final — nunca recalculada
  -- depois (secção 33).
  tolerance_snapshot jsonb,
  -- Lease de UI (secção 51) — nunca a garantia de integridade, essa é
  -- `version`.
  locked_by text,
  locked_at timestamptz,
  -- "Item não previsto" (secção 57) — adicionado depois de a sessão já ter
  -- iniciado, sempre auditado.
  is_unscoped boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),

  constraint stock_count_lines_session_item_unique unique (session_id, item_id)
);

create index if not exists stock_count_lines_session_idx on public.stock_count_lines (session_id);
create index if not exists stock_count_lines_org_item_idx on public.stock_count_lines (org_id, item_id);

alter table public.stock_count_lines enable row level security;

drop policy if exists "stock_count_lines: org-scoped all" on public.stock_count_lines;
create policy "stock_count_lines: org-scoped all"
  on public.stock_count_lines
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Tentativas — imutáveis depois de criadas (secção 15). Cada tentativa
-- guarda o SEU PRÓPRIO `system_quantity_at_count` — recontagens nunca
-- comparam números brutos entre tentativas diferentes (secção 26/27).
create table if not exists public.stock_count_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  count_line_id uuid not null references public.stock_count_lines(id),
  attempt_number integer not null,
  count_started_at timestamptz not null,
  counted_at timestamptz not null default now(),
  counted_quantity numeric(18,6) not null,
  system_quantity_at_count numeric(18,6) not null,
  -- Fingerprint local — COUNT(*) de stock_movements até count_started_at
  -- (nunca uma sequência global de ledger, ver README).
  ledger_version_at_count integer not null default 0,
  movements_during_count boolean not null default false,
  counted_by text not null,
  -- `true` para a "tentativa manual" criada implicitamente por
  -- resolveManually (secção 36).
  is_manual boolean not null default false,
  reason text,
  created_at timestamptz not null default now(),

  constraint stock_count_attempts_line_number_unique unique (count_line_id, attempt_number)
);

create index if not exists stock_count_attempts_line_idx on public.stock_count_attempts (count_line_id);

alter table public.stock_count_attempts enable row level security;

drop policy if exists "stock_count_attempts: org-scoped all" on public.stock_count_attempts;
create policy "stock_count_attempts: org-scoped all"
  on public.stock_count_attempts
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Fecha o ciclo stock_count_lines ↔ stock_count_attempts.
alter table public.stock_count_lines drop constraint if exists stock_count_lines_selected_attempt_fkey;
alter table public.stock_count_lines
  add constraint stock_count_lines_selected_attempt_fkey
  foreign key (selected_attempt_id) references public.stock_count_attempts(id);

-- Componentes — um "pedaço" de uma tentativa, numa unidade (base ou
-- alternativa) e opcionalmente numa zona (secções 20-22, 25).
-- `base_quantity = quantity × conversion_factor`, sempre calculado no
-- domínio (aplicativo), nunca confiado ao cliente nem recalculado aqui.
create table if not exists public.stock_count_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  attempt_id uuid not null references public.stock_count_attempts(id),
  count_area_id uuid references public.stock_count_zones(id),
  quantity numeric(18,6) not null check (quantity >= 0),
  unit text not null,
  conversion_factor numeric(18,6) not null default 1 check (conversion_factor > 0),
  base_quantity numeric(18,6) not null,
  created_at timestamptz not null default now()
);

create index if not exists stock_count_components_attempt_idx on public.stock_count_components (attempt_id);

alter table public.stock_count_components enable row level security;

drop policy if exists "stock_count_components: org-scoped all" on public.stock_count_components;
create policy "stock_count_components: org-scoped all"
  on public.stock_count_components
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Unidades alternativas por item (secções 20-22) — ex: item "Farinha" (base
-- `g`) ganha uma linha ("saco", 5000). Puramente um atalho de entrada;
-- nunca introduz uma segunda dimensão de stock.
create table if not exists public.stock_item_count_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  item_id uuid not null references public.stock_items(id),
  unit_label text not null,
  conversion_factor_to_base numeric(18,6) not null check (conversion_factor_to_base > 0),
  created_at timestamptz not null default now(),

  constraint stock_item_count_units_item_unit_unique unique (item_id, unit_label)
);

create index if not exists stock_item_count_units_item_idx on public.stock_item_count_units (item_id);

alter table public.stock_item_count_units enable row level security;

drop policy if exists "stock_item_count_units: org-scoped all" on public.stock_item_count_units;
create policy "stock_item_count_units: org-scoped all"
  on public.stock_item_count_units
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Configuração da empresa (secção 33) — 1 linha por organização.
create table if not exists public.stock_count_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  default_tolerance_absolute_qty numeric(18,6),
  default_tolerance_percent numeric(12,6),
  default_tolerance_financial_impact numeric(18,6),
  blind_count_default boolean not null default true,
  -- `null` = sem limite.
  max_recounts integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_count_settings_org_unique unique (org_id)
);

alter table public.stock_count_settings enable row level security;

drop policy if exists "stock_count_settings: org-scoped all" on public.stock_count_settings;
create policy "stock_count_settings: org-scoped all"
  on public.stock_count_settings
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Auditoria (secção 44/58) — mirror exato de `stock_review_audit_logs`.
create table if not exists public.stock_count_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('stock_count_session', 'stock_count_line', 'stock_count_zone')),
  entity_id uuid not null,
  action text not null,
  actor text not null,
  payload_before jsonb,
  payload_after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists stock_count_audit_logs_entity_idx
  on public.stock_count_audit_logs (org_id, entity_type, entity_id, created_at);

alter table public.stock_count_audit_logs enable row level security;

drop policy if exists "stock_count_audit_logs: org-scoped all" on public.stock_count_audit_logs;
create policy "stock_count_audit_logs: org-scoped all"
  on public.stock_count_audit_logs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Colunas aditivas em `stock_items` (secção 7/19/33) — nenhuma tabela
-- existente muda de significado, tudo é aditivo.
alter table public.stock_items
  add column if not exists stock_tracking_enabled boolean not null default true,
  add column if not exists tolerance_absolute_qty numeric(18,6),
  add column if not exists tolerance_percent numeric(12,6),
  add column if not exists tolerance_financial_impact numeric(18,6);

-- Colunas aditivas em `stock_categories` (legacy — nunca via
-- `stockCategoryService.ts`, ver README).
alter table public.stock_categories
  add column if not exists tolerance_absolute_qty numeric(18,6),
  add column if not exists tolerance_percent numeric(12,6),
  add column if not exists tolerance_financial_impact numeric(18,6);

-- `stock_movements` ganha as 2 colunas do AJUSTE_CONTAGEM (secção 49),
-- mesmo padrão já usado para `purchase_review_id`/`review_line_id`.
alter table public.stock_movements
  add column if not exists count_session_id uuid references public.stock_count_sessions(id),
  add column if not exists count_line_id uuid references public.stock_count_lines(id);

create unique index if not exists stock_movements_count_line_unique
  on public.stock_movements (count_session_id, count_line_id)
  where count_session_id is not null;
