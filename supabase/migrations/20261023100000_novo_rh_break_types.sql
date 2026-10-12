-- Novo RH (FE-103): catálogo de pausas. Cada pausa diz se o tempo conta como
-- trabalhado (paga / não paga / híbrida: os primeiros N minutos do dia pagos),
-- a duração máxima (o que passar não é pago), a janela, usos por dia e dias.
-- As marcações de pausa podem indicar o tipo (break_type_id; null = como antes).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.break_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  remuneration text not null check (remuneration in ('paid', 'unpaid', 'hybrid')),
  hybrid_paid_minutes integer check (hybrid_paid_minutes is null or hybrid_paid_minutes between 1 and 1440),
  max_minutes integer check (max_minutes is null or max_minutes between 1 and 1440),
  window_start time,
  window_end time,
  max_uses_per_day integer check (max_uses_per_day is null or max_uses_per_day between 1 and 50),
  -- Dias ISO (1 = segunda … 7 = domingo); null = todos.
  weekdays smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[])),
  archived boolean not null default false,
  version integer not null default 1,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint break_types_hybrid_ck check ((remuneration = 'hybrid') = (hybrid_paid_minutes is not null)),
  constraint break_types_window_ck check ((window_start is null) = (window_end is null) and (window_start is null or window_start <> window_end)),
  constraint break_types_org_id_uq unique (org_id, id)
);
create unique index if not exists break_types_name_uq on public.break_types (org_id, lower(btrim(name))) where not archived;

alter table public.clock_events add column if not exists break_type_id uuid;
alter table public.clock_events drop constraint if exists clock_events_break_type_fk;
alter table public.clock_events
  add constraint clock_events_break_type_fk foreign key (org_id, break_type_id) references public.break_types (org_id, id);

alter table public.break_types enable row level security;
drop policy if exists "break_types: org-scoped all" on public.break_types;
create policy "break_types: org-scoped all" on public.break_types for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
