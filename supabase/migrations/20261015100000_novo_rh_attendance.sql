-- Novo RH — Fase 4: registo de ponto e motor de assiduidade (ADR-0027).
-- Marcações append-only, revisões com motivo, pedidos de correção, dias
-- apurados versionados (TK-13), ajustes, incidentes deduplicados (RE-14),
-- fila de recálculo. Só objetos novos. Rollback em docs/migrations/rollback/.

create table if not exists public.clock_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  occurred_at timestamptz not null,
  segment_type text not null check (segment_type in ('work', 'remote', 'break_paid', 'break_unpaid', 'off')),
  source text not null check (source in ('web', 'pwa', 'kiosk', 'admin', 'correction')),
  client_event_id text check (client_event_id is null or length(client_event_id) between 1 and 100),
  location_id uuid,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  ip text,
  recorded_at timestamptz not null default now(),
  constraint clock_events_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists clock_events_org_employee_time_idx on public.clock_events (org_id, employee_id, occurred_at);
-- RE-9: o mesmo clientEventId (repetido 3 vezes) → 1 marcação.
create unique index if not exists clock_events_client_event_uq on public.clock_events (org_id, employee_id, client_event_id) where client_event_id is not null;

create or replace function public.forbid_clock_event_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'clock_events é append-only: corrija com uma revisão (motivo obrigatório)';
end;
$$;
drop trigger if exists clock_events_append_only on public.clock_events;
create trigger clock_events_append_only before update or delete on public.clock_events
  for each row execute function public.forbid_clock_event_changes();

create table if not exists public.clock_revisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  operation text not null check (operation in ('add', 'update', 'void')),
  -- Marcação original (uuid) ou acrescentada por revisão (`rev:<uuid>`).
  target_event_id text,
  occurred_at timestamptz,
  segment_type text check (segment_type is null or segment_type in ('work', 'remote', 'break_paid', 'break_unpaid', 'off')),
  before jsonb,
  -- Instante a que a revisão diz respeito (nova hora ou hora original), para ler por período.
  anchor_at timestamptz not null,
  reason text not null check (length(btrim(reason)) > 0),
  author text not null,
  state text not null default 'active' check (state in ('active', 'refused')),
  refusable_until timestamptz,
  refused_at timestamptz,
  refusal_comment text,
  created_at timestamptz not null default now(),
  constraint clock_revisions_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists clock_revisions_org_employee_idx on public.clock_revisions (org_id, employee_id, anchor_at);

-- Revisões: só o estado de recusa pode mudar (RE-11); nunca se apagam.
create or replace function public.guard_clock_revision_changes() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'clock_revisions não se apagam';
  end if;
  if (new.org_id, new.employee_id, new.operation, new.target_event_id, new.occurred_at, new.segment_type, new.anchor_at, new.reason, new.author, new.created_at)
     is distinct from (old.org_id, old.employee_id, old.operation, old.target_event_id, old.occurred_at, old.segment_type, old.anchor_at, old.reason, old.author, old.created_at) then
    raise exception 'clock_revisions: só o estado de recusa pode mudar';
  end if;
  return new;
end;
$$;
drop trigger if exists clock_revisions_guard on public.clock_revisions;
create trigger clock_revisions_guard before update or delete on public.clock_revisions
  for each row execute function public.guard_clock_revision_changes();

create table if not exists public.clock_correction_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  requested_by text not null,
  operation text not null check (operation in ('add', 'update', 'void')),
  -- Marcação original (uuid) ou acrescentada por revisão (`rev:<uuid>`).
  target_event_id text,
  occurred_at timestamptz,
  segment_type text check (segment_type is null or segment_type in ('work', 'remote', 'break_paid', 'break_unpaid', 'off')),
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by text,
  decided_at timestamptz,
  decision_comment text,
  revision_id uuid,
  created_at timestamptz not null default now(),
  constraint clock_correction_requests_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists clock_correction_requests_org_status_idx on public.clock_correction_requests (org_id, status, created_at);

create table if not exists public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  work_date date not null,
  version integer not null,
  current boolean not null default true,
  worked_seconds integer not null,
  break_seconds integer not null,
  night_seconds integer not null,
  theoretical_seconds integer not null,
  excess_seconds integer not null,
  pending_seconds integer not null,
  config_hash text not null,
  calculated_at timestamptz not null default now(),
  constraint attendance_days_version_uq unique (org_id, employee_id, work_date, version),
  constraint attendance_days_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create unique index if not exists attendance_days_current_uq on public.attendance_days (org_id, employee_id, work_date) where current;

-- TK-13: um recálculo que muda o excedente gera um movimento de ajuste (o passado não muda em silêncio).
create table if not exists public.attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  work_date date not null,
  from_version integer not null,
  to_version integer not null,
  delta_excess_seconds integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint attendance_adjustments_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists attendance_adjustments_idx on public.attendance_adjustments (org_id, employee_id, work_date);

create table if not exists public.attendance_incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  work_date date not null,
  type text not null check (type in ('missing_in', 'missing_out', 'auto_closed', 'late')),
  source text not null default 'engine',
  status text not null default 'open' check (status in ('open', 'resolved_correct', 'resolved_validate', 'dismissed')),
  comment text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- RE-14: um incidente por (colaborador, dia, tipo, origem).
  constraint attendance_incidents_natural_uq unique (org_id, employee_id, work_date, type, source),
  constraint attendance_incidents_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists attendance_incidents_open_idx on public.attendance_incidents (org_id, status, work_date);

create table if not exists public.attendance_recalc_queue (
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  work_date date not null,
  requested_at timestamptz not null default now(),
  primary key (org_id, employee_id, work_date)
);

alter table public.clock_events enable row level security;
alter table public.clock_revisions enable row level security;
alter table public.clock_correction_requests enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_adjustments enable row level security;
alter table public.attendance_incidents enable row level security;
alter table public.attendance_recalc_queue enable row level security;

drop policy if exists "clock_events: org-scoped all" on public.clock_events;
create policy "clock_events: org-scoped all" on public.clock_events for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "clock_revisions: org-scoped all" on public.clock_revisions;
create policy "clock_revisions: org-scoped all" on public.clock_revisions for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "clock_correction_requests: org-scoped all" on public.clock_correction_requests;
create policy "clock_correction_requests: org-scoped all" on public.clock_correction_requests for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "attendance_days: org-scoped all" on public.attendance_days;
create policy "attendance_days: org-scoped all" on public.attendance_days for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "attendance_adjustments: org-scoped all" on public.attendance_adjustments;
create policy "attendance_adjustments: org-scoped all" on public.attendance_adjustments for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "attendance_incidents: org-scoped all" on public.attendance_incidents;
create policy "attendance_incidents: org-scoped all" on public.attendance_incidents for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "attendance_recalc_queue: org-scoped all" on public.attendance_recalc_queue;
create policy "attendance_recalc_queue: org-scoped all" on public.attendance_recalc_queue for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
