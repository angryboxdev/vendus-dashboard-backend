-- RH 2.0 T4 (ausências no padrão novo) + Portal do Colaborador ticket 12
-- (pedidos: justificar falta / pedir folga). Aditiva — o legacy continua a
-- funcionar; as linhas existentes ficam `status = 'active'`, origem `hr`.

-- 1) Ausências: estado (nunca apagar fisicamente no código novo), período
--    parcial em horas, origem e ligação ao pedido do Portal.
alter table public.hr_leave_requests
  add column if not exists status text not null default 'active',
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists minutes integer,
  add column if not exists source text not null default 'hr',
  add column if not exists portal_request_id uuid,
  add column if not exists created_by text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancel_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_leave_requests_status_check') then
    alter table public.hr_leave_requests add constraint hr_leave_requests_status_check check (status in ('active', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_leave_requests_source_check') then
    alter table public.hr_leave_requests add constraint hr_leave_requests_source_check check (source in ('hr', 'portal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_leave_requests_partial_check') then
    -- Parcial = as duas horas preenchidas, num só dia, com fim depois do início.
    alter table public.hr_leave_requests add constraint hr_leave_requests_partial_check check (
      (start_time is null and end_time is null)
      or (start_time is not null and end_time is not null and end_time > start_time and start_date = end_date)
    );
  end if;
end $$;

-- Tipos novos: Ausência autorizada (ex.: folga pedida e aprovada), Licença, Outro.
alter table public.hr_leave_requests drop constraint if exists hr_leave_requests_type_check;
alter table public.hr_leave_requests add constraint hr_leave_requests_type_check check (
  type in ('vacation', 'sick_leave', 'justified', 'unjustified', 'compensatory', 'authorized_absence', 'license', 'other')
);

create index if not exists hr_leave_requests_active_range_idx
  on public.hr_leave_requests (org_id, start_date, end_date)
  where status = 'active';

-- 2) Pedidos do Portal (justificar falta / pedir folga).
create table if not exists public.hr_portal_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  kind text not null check (kind in ('justify_absence', 'day_off')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  -- Justificar falta: o turno em causa. Folga: null.
  work_shift_id uuid,
  start_date date not null,
  end_date date not null,
  reason_code text not null,
  reason_text text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  -- Ausência criada ao aprovar.
  leave_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_portal_requests_dates_check check (end_date >= start_date),
  constraint hr_portal_requests_org_id_employee_id_fkey
    foreign key (org_id, employee_id) references public.hr_employees(org_id, id)
);

create index if not exists hr_portal_requests_pending_idx
  on public.hr_portal_requests (org_id, kind, created_at)
  where status = 'pending';
create index if not exists hr_portal_requests_employee_idx
  on public.hr_portal_requests (org_id, employee_id, created_at desc);

alter table public.hr_portal_requests enable row level security;

drop policy if exists "hr_portal_requests: org-scoped all" on public.hr_portal_requests;
create policy "hr_portal_requests: org-scoped all"
  on public.hr_portal_requests
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
