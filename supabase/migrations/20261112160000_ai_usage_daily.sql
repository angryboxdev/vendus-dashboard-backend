-- Orçamento diário de IA por organização (leitor de faturas F4 / E4).
-- Uma linha por organização, dia (UTC) e funcionalidade; conta as chamadas feitas à IA.
-- Quando o total do dia chega ao limite (AI_DAILY_LIMIT_PER_ORG), as faturas com QR continuam a
-- ser lidas sem IA; as sem QR esperam pelo dia seguinte; categorias e conciliação ficam sem IA.
-- Tabela nova, org-scoped (RLS org_id = current_org()). Idempotente.

create table if not exists public.ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  day date not null,
  feature text not null check (feature in ('invoice_extraction', 'line_classification', 'stock_match')),
  calls integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  constraint ai_usage_daily_unique unique (org_id, day, feature)
);

create index if not exists ai_usage_daily_org_day_idx on public.ai_usage_daily (org_id, day);

alter table public.ai_usage_daily enable row level security;

drop policy if exists "ai_usage_daily: org-scoped all" on public.ai_usage_daily;
create policy "ai_usage_daily: org-scoped all"
  on public.ai_usage_daily
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

comment on table public.ai_usage_daily is 'Chamadas à IA por organização e dia (UTC) — orçamento diário; nunca guarda conteúdo dos documentos.';
