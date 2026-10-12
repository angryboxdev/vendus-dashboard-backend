-- Novo RH — Fase 7: modelos de turno, escalas com versões publicadas,
-- histórico de publicações (append-only) e trocas (ADR-0030).
-- Só objetos novos (o RH atual mantém hr_shift_templates/hr_work_shifts).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.roster_shift_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  abbreviation text not null check (length(btrim(abbreviation)) between 1 and 6),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  on_call boolean not null default false,
  -- [{ "start": "HH:MM", "end": "HH:MM" }] — fim ≤ início = dia seguinte.
  segments jsonb not null check (jsonb_typeof(segments) = 'array' and jsonb_array_length(segments) between 1 and 4),
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint roster_shift_templates_org_id_uq unique (org_id, id)
);
create unique index if not exists roster_shift_templates_name_uq on public.roster_shift_templates (org_id, lower(name)) where not archived;

create table if not exists public.rosters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  target_type text not null check (target_type in ('location', 'group')),
  target_id uuid not null,
  version integer not null default 0,
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint rosters_org_id_uq unique (org_id, id)
);

create table if not exists public.roster_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  roster_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  kind text not null default 'shift' check (kind in ('shift', 'day_off')),
  segments jsonb not null default '[]'::jsonb,
  template_id uuid,
  on_call boolean not null default false,
  deleted boolean not null default false,
  -- Rascunho com alterações por publicar.
  dirty boolean not null default true,
  -- Estado publicado (null = nunca publicado ou removido na publicação).
  published jsonb,
  published_version integer,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  constraint roster_shifts_roster_fk foreign key (org_id, roster_id) references public.rosters (org_id, id),
  constraint roster_shifts_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint roster_shifts_template_fk foreign key (org_id, template_id) references public.roster_shift_templates (org_id, id),
  constraint roster_shifts_org_id_uq unique (org_id, id)
);
create index if not exists roster_shifts_roster_date_idx on public.roster_shifts (org_id, roster_id, work_date);
create index if not exists roster_shifts_employee_date_idx on public.roster_shifts (org_id, employee_id, work_date);

create table if not exists public.roster_publications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  roster_id uuid not null,
  version integer not null,
  reason text,
  -- Avisos confirmados por quem publicou (RE-16).
  confirmed_warnings jsonb not null default '[]'::jsonb,
  -- [{ shiftId, employeeId, before, after }]
  changes jsonb not null,
  published_by text not null,
  created_at timestamptz not null default now(),
  constraint roster_publications_uq unique (org_id, roster_id, version),
  constraint roster_publications_roster_fk foreign key (org_id, roster_id) references public.rosters (org_id, id)
);
drop trigger if exists roster_publications_append_only on public.roster_publications;
create trigger roster_publications_append_only before update or delete on public.roster_publications
  for each row execute function public.forbid_append_only_changes();

create table if not exists public.roster_swaps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  shift_id uuid not null,
  counter_shift_id uuid,
  requester_employee_id uuid not null,
  target_employee_id uuid not null,
  status text not null default 'pending_target' check (status in ('pending_target', 'pending_manager', 'approved', 'rejected', 'cancelled')),
  comment text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint roster_swaps_shift_fk foreign key (org_id, shift_id) references public.roster_shifts (org_id, id),
  constraint roster_swaps_counter_fk foreign key (org_id, counter_shift_id) references public.roster_shifts (org_id, id),
  constraint roster_swaps_not_self check (requester_employee_id <> target_employee_id)
);
create index if not exists roster_swaps_status_idx on public.roster_swaps (org_id, status, created_at);

alter table public.roster_shift_templates enable row level security;
alter table public.rosters enable row level security;
alter table public.roster_shifts enable row level security;
alter table public.roster_publications enable row level security;
alter table public.roster_swaps enable row level security;

drop policy if exists "roster_shift_templates: org-scoped all" on public.roster_shift_templates;
create policy "roster_shift_templates: org-scoped all" on public.roster_shift_templates for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "rosters: org-scoped all" on public.rosters;
create policy "rosters: org-scoped all" on public.rosters for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "roster_shifts: org-scoped all" on public.roster_shifts;
create policy "roster_shifts: org-scoped all" on public.roster_shifts for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "roster_publications: org-scoped all" on public.roster_publications;
create policy "roster_publications: org-scoped all" on public.roster_publications for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "roster_swaps: org-scoped all" on public.roster_swaps;
create policy "roster_swaps: org-scoped all" on public.roster_swaps for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
