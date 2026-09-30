-- Módulo Stock — Planeamento de Stock (Stock Intelligence 3.0). Camada de
-- previsão/recomendação puramente aditiva: nunca altera stock diretamente
-- (só `stock-purchase-review`/`stock-count` criam movimentos reais). Mesmo
-- padrão já estabelecido nesta sessão: RLS `current_org()`,
-- `drop policy if exists` antes de `create policy`, `if not exists` em todo
-- o lado.

-- Cache diária de vendas por "fonte de procura" (produto/pizza+tamanho ou
-- item direto) — nunca fonte de verdade de stock (secção 86), só histórico
-- para treinar/validar o forecast. `demand_source_ref` já inclui o tamanho
-- quando aplicável (ex: "<pizza_id>:small") para evitar uma coluna
-- adicional nullable dentro da chave única.
create table if not exists public.sales_demand_actuals_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  demand_source_type text not null check (demand_source_type in ('pizza', 'stock')),
  demand_source_ref text not null,
  sale_date date not null,
  quantity_sold numeric(18,6) not null,
  updated_at timestamptz not null default now(),

  constraint sales_demand_actuals_daily_unique unique (org_id, location_id, demand_source_type, demand_source_ref, sale_date)
);

create index if not exists sales_demand_actuals_daily_lookup_idx
  on public.sales_demand_actuals_daily (org_id, location_id, demand_source_type, demand_source_ref, sale_date);

alter table public.sales_demand_actuals_daily enable row level security;

drop policy if exists "sales_demand_actuals_daily: org-scoped all" on public.sales_demand_actuals_daily;
create policy "sales_demand_actuals_daily: org-scoped all"
  on public.sales_demand_actuals_daily
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Execuções do pipeline diário — histórico sempre preservado, `is_latest`
-- é a única coisa que muda quando um run novo conclui (secção 27).
create table if not exists public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  generated_at timestamptz not null default now(),
  data_cutoff_at timestamptz not null,
  horizon_start date not null,
  horizon_end date not null,
  model_name text not null,
  model_version text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  quality_score numeric(6,3),
  is_latest boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists forecast_runs_org_location_idx on public.forecast_runs (org_id, location_id, generated_at desc);
create index if not exists forecast_runs_latest_idx on public.forecast_runs (org_id, location_id) where is_latest;

alter table public.forecast_runs enable row level security;

drop policy if exists "forecast_runs: org-scoped all" on public.forecast_runs;
create policy "forecast_runs: org-scoped all"
  on public.forecast_runs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Previsão de vendas por fonte de procura e dia, por run.
create table if not exists public.forecast_demand_points (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  run_id uuid not null references public.forecast_runs(id),
  demand_source_type text not null check (demand_source_type in ('pizza', 'stock')),
  demand_source_ref text not null,
  forecast_date date not null,
  predicted_quantity numeric(18,6) not null,
  -- Nunca uma percentagem fabricada (secção 88) — só "Alta"/"Média"/"Baixa".
  confidence text not null check (confidence in ('alta', 'media', 'baixa')),

  constraint forecast_demand_points_unique unique (run_id, demand_source_type, demand_source_ref, forecast_date)
);

create index if not exists forecast_demand_points_run_idx on public.forecast_demand_points (run_id);

alter table public.forecast_demand_points enable row level security;

drop policy if exists "forecast_demand_points: org-scoped all" on public.forecast_demand_points;
create policy "forecast_demand_points: org-scoped all"
  on public.forecast_demand_points
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Consumo de ingrediente previsto por item de stock e dia, por run. A
-- projeção de stock em si (atual − acumulado) NUNCA é gravada — é sempre
-- calculada em leitura (decisão arquitetural do módulo, ver README).
create table if not exists public.forecast_stock_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  run_id uuid not null references public.forecast_runs(id),
  stock_item_id uuid not null references public.stock_items(id),
  forecast_date date not null,
  expected_consumption numeric(18,6) not null,
  cumulative_consumption numeric(18,6) not null,

  constraint forecast_stock_requirements_unique unique (run_id, stock_item_id, forecast_date)
);

create index if not exists forecast_stock_requirements_run_item_idx on public.forecast_stock_requirements (run_id, stock_item_id);

alter table public.forecast_stock_requirements enable row level security;

drop policy if exists "forecast_stock_requirements: org-scoped all" on public.forecast_stock_requirements;
create policy "forecast_stock_requirements: org-scoped all"
  on public.forecast_stock_requirements
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Recomendação de reposição por item, por run — nunca um estado de
-- encomenda (secção 59), sempre explicável (`explanation_data`).
create table if not exists public.replenishment_recommendations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  run_id uuid not null references public.forecast_runs(id),
  stock_item_id uuid not null references public.stock_items(id),
  supplier_id uuid references public.suppliers(id),
  stock_now numeric(18,6) not null,
  projected_at_window numeric(18,6),
  target_stock numeric(18,6) not null,
  safety_stock numeric(18,6) not null,
  suggested_base_qty numeric(18,6) not null,
  -- `null` quando não há embalagem aprendida — nunca inventada (secção 51).
  suggested_purchase_qty numeric(18,6),
  purchase_unit text,
  estimated_cost numeric(18,6),
  confidence text not null check (confidence in ('alta', 'media', 'baixa')),
  explanation_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint replenishment_recommendations_unique unique (run_id, stock_item_id)
);

create index if not exists replenishment_recommendations_run_idx on public.replenishment_recommendations (run_id);
create index if not exists replenishment_recommendations_org_item_idx on public.replenishment_recommendations (org_id, stock_item_id);

alter table public.replenishment_recommendations enable row level security;

drop policy if exists "replenishment_recommendations: org-scoped all" on public.replenishment_recommendations;
create policy "replenishment_recommendations: org-scoped all"
  on public.replenishment_recommendations
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Auditoria de revisão manual da quantidade sugerida (secção 60) — nunca
-- assume que a compra foi de facto efetuada; insert-only.
create table if not exists public.recommendation_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  recommendation_id uuid not null references public.replenishment_recommendations(id),
  suggested_qty numeric(18,6) not null,
  reviewed_qty numeric(18,6) not null,
  reviewed_by text not null,
  reviewed_at timestamptz not null default now(),
  reason text
);

create index if not exists recommendation_reviews_recommendation_idx on public.recommendation_reviews (recommendation_id);

alter table public.recommendation_reviews enable row level security;

drop policy if exists "recommendation_reviews: org-scoped all" on public.recommendation_reviews;
create policy "recommendation_reviews: org-scoped all"
  on public.recommendation_reviews
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Alertas — poucos tipos, sempre acionáveis (secção 76). Upsert por
-- fingerprint (secções 72-73): nunca duplica a mesma condição; auto-resolve
-- quando a condição desaparece num run seguinte. `item_id` é NOT NULL
-- porque todos os tipos de alerta desta ronda são por item — uma futura
-- ronda com alertas não ligados a um item precisará de rever esta
-- constraint (ver README).
create table if not exists public.planning_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  item_id uuid not null references public.stock_items(id),
  alert_type text not null check (alert_type in ('stockout_risk', 'excess_stock', 'price_anomaly', 'data_quality_warning')),
  fingerprint text not null,
  severity text not null check (severity in ('baixa', 'media', 'alta', 'critica')),
  state text not null default 'active' check (state in ('active', 'acknowledged', 'silenced', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  silenced_until timestamptz,
  context_snapshot jsonb not null default '{}'::jsonb,

  constraint planning_alerts_fingerprint_unique unique (org_id, location_id, item_id, alert_type)
);

create index if not exists planning_alerts_org_location_state_idx on public.planning_alerts (org_id, location_id, state);

alter table public.planning_alerts enable row level security;

drop policy if exists "planning_alerts: org-scoped all" on public.planning_alerts;
create policy "planning_alerts: org-scoped all"
  on public.planning_alerts
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Feedback de desvio — uma linha por (org, loja, dia); nunca perguntada
-- duas vezes pela mesma anomalia (secção 34/97). `submit` só altera
-- reason_code/comment/submitted_by/submitted_at — nunca o modelo.
create table if not exists public.forecast_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  period_date date not null,
  forecast_value numeric(18,6) not null,
  actual_value numeric(18,6) not null,
  deviation_percent numeric(12,6),
  reason_code text,
  comment text,
  submitted_by text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint forecast_feedback_unique unique (org_id, location_id, period_date)
);

create index if not exists forecast_feedback_org_location_idx on public.forecast_feedback (org_id, location_id, period_date desc);

alter table public.forecast_feedback enable row level security;

drop policy if exists "forecast_feedback: org-scoped all" on public.forecast_feedback;
create policy "forecast_feedback: org-scoped all"
  on public.forecast_feedback
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Colunas aditivas — nenhuma tabela existente muda de significado.
alter table public.stock_items
  add column if not exists safety_stock_qty numeric(18,6);

-- Reaproveita a tabela de "definições da empresa sobre stock" já criada
-- pelo módulo `stock-count` (evita uma 3ª tabela de settings, secção 70 —
-- limiar configurável, nunca hardcoded "30 dias").
alter table public.stock_count_settings
  add column if not exists slow_moving_days_threshold integer;
