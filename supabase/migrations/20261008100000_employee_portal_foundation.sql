-- Portal do Colaborador + Picagem por Geolocalização — ticket 01
-- (.scratch/portal-colaborador). Migração única de fundação, para ser
-- aplicada de uma vez antes de qualquer teste.
--
-- 1) Papel `employee` em `org_members` (abaixo de hr_viewer na aplicação:
--    as rotas de gestão recusam-no). O token hook copia o papel tal como
--    está — não precisa de alteração.
-- 2) `hr_employees.user_id`: ligação da conta (auth.users) à ficha do
--    colaborador. Uma conta por colaborador e por organização; um gestor
--    que também é colaborador liga a SUA conta à sua ficha (nunca uma
--    segunda conta).
-- 3) Geofence no Local: coordenadas, raio e política (off por omissão —
--    nada muda para quem não configurar).
-- 4) `hr_shift_attendance.registration_source` aceita `employee_portal`.
-- 5) `hr_attendance_punch_events`: evidência de cada toque de Entrada/Saída
--    (hora do servidor com data, localização só no momento da picagem,
--    resultado da zona, chave de idempotência única). A linha de
--    assiduidade continua a ser a fonte da verdade — isto não é uma
--    segunda assiduidade.
--
-- Aditivo e reexecutável.

-- 1) Papel employee
-- O check original foi criado inline (sem nome explícito): apaga qualquer
-- check de org_members que restrinja `role`, seja qual for o nome gerado.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.org_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.org_members drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.org_members
  add constraint org_members_role_check check (role in ('admin', 'manager', 'hr_viewer', 'employee'));

-- 2) Conta ↔ colaborador
alter table public.hr_employees
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists hr_employees_org_id_user_id_uq
  on public.hr_employees (org_id, user_id)
  where user_id is not null;

-- 3) Geofence no Local
alter table public.locations
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists geofence_radius_m integer not null default 100,
  add column if not exists geofence_policy text not null default 'off';

alter table public.locations drop constraint if exists locations_latitude_check;
alter table public.locations
  add constraint locations_latitude_check check (latitude is null or latitude between -90 and 90);
alter table public.locations drop constraint if exists locations_longitude_check;
alter table public.locations
  add constraint locations_longitude_check check (longitude is null or longitude between -180 and 180);
alter table public.locations drop constraint if exists locations_coordinates_pair_check;
alter table public.locations
  add constraint locations_coordinates_pair_check check ((latitude is null) = (longitude is null));
alter table public.locations drop constraint if exists locations_geofence_radius_m_check;
alter table public.locations
  add constraint locations_geofence_radius_m_check check (geofence_radius_m between 10 and 5000);
alter table public.locations drop constraint if exists locations_geofence_policy_check;
alter table public.locations
  add constraint locations_geofence_policy_check check (geofence_policy in ('off', 'warn', 'block'));

-- 4) Nova origem de picagem
alter table public.hr_shift_attendance drop constraint if exists hr_shift_attendance_registration_source_check;
alter table public.hr_shift_attendance
  add constraint hr_shift_attendance_registration_source_check
  check (registration_source in ('dashboard', 'employee_qr', 'import', 'employee_portal'));

-- Chave composta para a FK dos eventos (padrão org_id + id).
create unique index if not exists hr_shift_attendance_org_id_id_uq on public.hr_shift_attendance (org_id, id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_shift_attendance_org_id_id_key') then
    alter table public.hr_shift_attendance
      add constraint hr_shift_attendance_org_id_id_key unique using index hr_shift_attendance_org_id_id_uq;
  end if;
end $$;

-- 5) Eventos de picagem
create table if not exists public.hr_attendance_punch_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  attendance_id uuid not null,
  employee_id uuid not null,
  location_id uuid not null,
  work_shift_id uuid,
  kind text not null check (kind in ('in', 'out')),
  server_at timestamptz not null default now(),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  accuracy_m numeric(8, 1) check (accuracy_m is null or accuracy_m >= 0),
  distance_m numeric(10, 1) check (distance_m is null or distance_m >= 0),
  geofence_status text not null check (geofence_status in ('inside', 'outside', 'unverified', 'not_required')),
  unverified_reason text check (
    unverified_reason is null
    or unverified_reason in ('low_accuracy', 'ambiguous', 'permission_denied', 'unavailable', 'timeout', 'location_not_configured')
  ),
  source text not null default 'employee_portal' check (source in ('employee_portal')),
  idempotency_key uuid not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  constraint hr_attendance_punch_events_idempotency_key unique (org_id, idempotency_key),
  constraint hr_attendance_punch_events_coordinates_pair_check check ((latitude is null) = (longitude is null)),
  constraint hr_attendance_punch_events_org_id_attendance_id_fkey
    foreign key (org_id, attendance_id) references public.hr_shift_attendance(org_id, id) on delete cascade,
  constraint hr_attendance_punch_events_org_id_employee_id_fkey
    foreign key (org_id, employee_id) references public.hr_employees(org_id, id),
  constraint hr_attendance_punch_events_org_id_location_id_fkey
    foreign key (org_id, location_id) references public.locations(org_id, id)
);

create index if not exists hr_attendance_punch_events_attendance_idx
  on public.hr_attendance_punch_events (org_id, attendance_id);
create index if not exists hr_attendance_punch_events_employee_idx
  on public.hr_attendance_punch_events (org_id, employee_id, server_at desc);

alter table public.hr_attendance_punch_events enable row level security;

drop policy if exists "hr_attendance_punch_events: org-scoped all" on public.hr_attendance_punch_events;
create policy "hr_attendance_punch_events: org-scoped all"
  on public.hr_attendance_punch_events
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
