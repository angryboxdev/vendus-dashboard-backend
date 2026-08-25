create table public.analytics_monthly_cache (
  year            smallint    not null,
  month           smallint    not null,
  gross_cents     bigint      not null,
  documents_count integer     not null,
  computed_at     timestamptz not null default now(),
  primary key (year, month)
);
