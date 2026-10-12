-- Novo RH (FE-105): tipos adicionais de registo (formação, deslocação, …).
-- Remuneração sempre escolhida (paga / não paga / híbrida: N min pagos por dia);
-- máximo por dia (o excedente não conta); dias e horas bloqueados para começar.
-- As marcações de trabalho podem indicar o tipo (clock_type_id; null = registo normal).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.clock_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  remote boolean not null default false,
  remuneration text not null check (remuneration in ('paid', 'unpaid', 'hybrid')),
  hybrid_paid_minutes integer check (hybrid_paid_minutes is null or hybrid_paid_minutes between 1 and 1440),
  max_minutes_per_day integer check (max_minutes_per_day is null or max_minutes_per_day between 1 and 1440),
  -- Dias ISO em que não se pode começar (nunca os 7).
  blocked_weekdays smallint[] check (blocked_weekdays is null or (cardinality(blocked_weekdays) between 1 and 6 and blocked_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])),
  -- [{ "start": "HH:MM", "end": "HH:MM" }] em que não se pode começar.
  blocked_hours jsonb not null default '[]'::jsonb check (jsonb_typeof(blocked_hours) = 'array' and jsonb_array_length(blocked_hours) <= 6),
  archived boolean not null default false,
  version integer not null default 1,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clock_types_hybrid_ck check ((remuneration = 'hybrid') = (hybrid_paid_minutes is not null)),
  constraint clock_types_org_id_uq unique (org_id, id)
);
create unique index if not exists clock_types_name_uq on public.clock_types (org_id, lower(btrim(name))) where not archived;

alter table public.clock_events add column if not exists clock_type_id uuid;
alter table public.clock_events drop constraint if exists clock_events_clock_type_fk;
alter table public.clock_events
  add constraint clock_events_clock_type_fk foreign key (org_id, clock_type_id) references public.clock_types (org_id, id);

alter table public.clock_types enable row level security;
drop policy if exists "clock_types: org-scoped all" on public.clock_types;
create policy "clock_types: org-scoped all" on public.clock_types for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
