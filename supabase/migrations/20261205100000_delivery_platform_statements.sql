-- Extratos das plataformas de delivery (task «Importador dos extratos das plataformas», F1 —
-- .scratch/importador-plataformas/spec.md): o que cada plataforma vendeu, descontou (promoções,
-- comissões, marketing, reembolsos, taxas) e transferiu, por período. Um documento por empresa,
-- plataforma e número (importar outra vez substitui). Nunca guarda dados de clientes.
-- Idempotente. Rollback: docs/migrations/rollback/20261205100000_delivery_platform_statements.sql

create table if not exists public.delivery_platform_statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  platform text not null,
  document_kind text not null,
  document_number text not null,
  period_from date not null,
  period_to date not null,
  issued_on date null,
  orders_count integer null,
  -- [{ kind, label, grossCents, vatCents }]: linhas do documento já normalizadas.
  lines jsonb not null default '[]'::jsonb,
  -- [{ periodFrom, periodTo, paidOn, netCents }]: transferências e o período que pagam.
  payouts jsonb not null default '[]'::jsonb,
  net_payout_cents bigint not null,
  file_name text not null,
  imported_by text null,
  imported_at timestamptz not null default now(),
  constraint delivery_platform_statements_doc_key unique (org_id, platform, document_number),
  constraint delivery_platform_statements_platform_check check (platform in ('uber_eats', 'glovo', 'bolt_food')),
  constraint delivery_platform_statements_period_check check (period_to >= period_from)
);

create index if not exists delivery_platform_statements_period_idx
  on public.delivery_platform_statements (org_id, period_from, period_to);

alter table public.delivery_platform_statements enable row level security;
drop policy if exists "delivery_platform_statements: org-scoped all" on public.delivery_platform_statements;
create policy "delivery_platform_statements: org-scoped all"
  on public.delivery_platform_statements
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
