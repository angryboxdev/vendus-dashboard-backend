-- Novo RH → Escalas: Plano de Cobertura (opcional por empresa; desligado por
-- omissão em time_tracking.roster.coverage_enabled). Mínimos de pessoas por
-- centro (ou área do centro), por dia da semana ou numa data concreta
-- (exceção que substitui as regras semanais desse dia). Fim ≤ início = o
-- intervalo passa a meia-noite. Só informa: nunca bloqueia a publicação.
-- Rollback em docs/migrations/rollback/.

create table if not exists public.coverage_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null,
  area_id uuid,
  weekday smallint check (weekday between 1 and 7),
  on_date date,
  start_time time not null,
  end_time time not null,
  min_people integer not null check (min_people between 0 and 500),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coverage_rules_when_ck check ((weekday is null) <> (on_date is null)),
  constraint coverage_rules_interval_ck check (start_time <> end_time),
  constraint coverage_rules_location_fk foreign key (org_id, location_id) references public.locations (org_id, id),
  constraint coverage_rules_area_fk foreign key (org_id, area_id) references public.work_areas (org_id, id)
);

create index if not exists coverage_rules_location_idx on public.coverage_rules (org_id, location_id);

alter table public.coverage_rules enable row level security;
drop policy if exists "coverage_rules: org-scoped all" on public.coverage_rules;
create policy "coverage_rules: org-scoped all" on public.coverage_rules for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
