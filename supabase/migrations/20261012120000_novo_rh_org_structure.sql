-- Novo RH — Fase 1, ticket 04: estrutura organizacional (Configurações C3.3–C3.7, C3.11).
-- Departamentos, grupos hierárquicos, pertenças com vigência, contactos por
-- função, aceitação de termos/DPA. Só objetos novos + uma CHECK `not valid`
-- no raio dos locais (não toca nas linhas existentes). Rollback em docs/migrations/rollback/.

-- ── Departamentos ─────────────────────────────────────────────────────
create table if not exists public.org_departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_departments_org_id_id_key unique (org_id, id)
);
create unique index if not exists org_departments_name_uq on public.org_departments (org_id, lower(btrim(name))) where not archived;

-- ── Grupos (árvore) ───────────────────────────────────────────────────
create table if not exists public.org_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  parent_id uuid,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,30}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  description text check (description is null or length(description) <= 250),
  hidden boolean not null default false,
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_groups_org_id_id_key unique (org_id, id),
  constraint org_groups_parent_fk foreign key (org_id, parent_id) references public.org_groups (org_id, id),
  constraint org_groups_not_own_parent check (parent_id is null or parent_id <> id)
);
create unique index if not exists org_groups_code_uq on public.org_groups (org_id, lower(code)) where not archived;
create index if not exists org_groups_org_parent_idx on public.org_groups (org_id, parent_id);

-- Sem ciclos (a aplicação também verifica; isto é a rede).
create or replace function public.org_groups_no_cycle() returns trigger
language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    with recursive up(id, parent_id) as (
      select g.id, g.parent_id from public.org_groups g where g.org_id = new.org_id and g.id = new.parent_id
      union all
      select g.id, g.parent_id from public.org_groups g join up on g.id = up.parent_id where g.org_id = new.org_id
    )
    select 1 from up where up.id = new.id
  ) then
    raise exception 'org_groups: o grupo não pode ficar dentro de si próprio (ciclo)';
  end if;
  return new;
end;
$$;
drop trigger if exists org_groups_no_cycle on public.org_groups;
create trigger org_groups_no_cycle before insert or update of parent_id on public.org_groups
  for each row execute function public.org_groups_no_cycle();

-- ── Pertença do colaborador a departamentos/grupos (com vigência) ──────
create table if not exists public.employee_org_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  unit_type text not null check (unit_type in ('department', 'group')),
  unit_id uuid not null,
  valid_from date not null,
  valid_to date,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint employee_org_assignments_period_ck check (valid_to is null or valid_to >= valid_from),
  constraint employee_org_assignments_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists employee_org_assignments_org_employee_idx on public.employee_org_assignments (org_id, employee_id);
create index if not exists employee_org_assignments_org_unit_idx on public.employee_org_assignments (org_id, unit_type, unit_id);

-- ── Contactos por função (C3.11) — separados dos utilizadores ──────────
create table if not exists public.org_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  role text not null check (role in ('primary', 'billing', 'communications', 'technical', 'onboarding')),
  name text not null check (length(btrim(name)) between 1 and 120),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or length(phone) <= 30),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists org_contacts_role_uq on public.org_contacts (org_id, role);

-- ── Aceitação de termos e DPA (C3.7) — append-only ─────────────────────
create table if not exists public.org_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document text not null check (document in ('terms_and_dpa')),
  version text not null check (length(btrim(version)) between 1 and 40),
  accepted_by text not null,
  accepted_at timestamptz not null default now(),
  ip text
);
create index if not exists org_terms_acceptances_org_idx on public.org_terms_acceptances (org_id, document, accepted_at desc);

create or replace function public.forbid_terms_acceptance_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'org_terms_acceptances é append-only';
end;
$$;
drop trigger if exists org_terms_acceptances_append_only on public.org_terms_acceptances;
create trigger org_terms_acceptances_append_only before update or delete on public.org_terms_acceptances
  for each row execute function public.forbid_terms_acceptance_changes();

-- ── Raio da zona dos centros 10–1000 m (C3.4) — só para linhas novas/alteradas ──
alter table public.locations drop constraint if exists locations_geofence_radius_range_ck;
alter table public.locations
  add constraint locations_geofence_radius_range_ck check (geofence_radius_m between 10 and 1000) not valid;

-- ── RLS org-claim ──────────────────────────────────────────────────────
alter table public.org_departments enable row level security;
alter table public.org_groups enable row level security;
alter table public.employee_org_assignments enable row level security;
alter table public.org_contacts enable row level security;
alter table public.org_terms_acceptances enable row level security;

drop policy if exists "org_departments: org-scoped all" on public.org_departments;
create policy "org_departments: org-scoped all" on public.org_departments for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "org_groups: org-scoped all" on public.org_groups;
create policy "org_groups: org-scoped all" on public.org_groups for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "employee_org_assignments: org-scoped all" on public.employee_org_assignments;
create policy "employee_org_assignments: org-scoped all" on public.employee_org_assignments for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "org_contacts: org-scoped all" on public.org_contacts;
create policy "org_contacts: org-scoped all" on public.org_contacts for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "org_terms_acceptances: org-scoped read" on public.org_terms_acceptances;
create policy "org_terms_acceptances: org-scoped read" on public.org_terms_acceptances for select to authenticated using (org_id = current_org());
drop policy if exists "org_terms_acceptances: org-scoped insert" on public.org_terms_acceptances;
create policy "org_terms_acceptances: org-scoped insert" on public.org_terms_acceptances for insert to authenticated with check (org_id = current_org());

-- ── Catálogo de acessos: company.structure ─────────────────────────────
-- Admin gere; Manager, RH e Financeiro veem (como o resto de "Empresa & Estrutura").
update public.access_profiles set permissions = permissions || '{"company.structure": "MANAGE"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'admin';
update public.access_profiles set permissions = permissions || '{"company.structure": "READ"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'manager';
update public.access_profiles set permissions = permissions || '{"company.structure": "READ"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'rh';
update public.access_profiles set permissions = permissions || '{"company.structure": "READ"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'financeiro';
