-- Migration: sales_summary_cache
-- Persistent cache for SalesSummaryResult (computed monthly consolidated report).
-- Three denormalized revenue columns exist so getYearMonths (growth chart) can
-- read 12 rows efficiently without deserializing 12 JSON blobs.

create table sales_summary_cache (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organizations(id) on delete cascade,
  year                    integer not null,
  month                   integer not null check (month between 1 and 12),
  payload                 jsonb not null,
  total_revenue_cents     bigint not null,
  vendus_revenue_cents    bigint not null,
  air_menu_revenue_cents  bigint not null,
  calculated_at           timestamptz not null default now(),
  unique (org_id, year, month)
);

comment on table sales_summary_cache is
  'Computed monthly sales summary (Vendus + AirMenu consolidated). '
  'TTL logic lives in GetSalesSummaryUseCase (15 min for current month; '
  'past months are immutable unless force-refreshed).';
