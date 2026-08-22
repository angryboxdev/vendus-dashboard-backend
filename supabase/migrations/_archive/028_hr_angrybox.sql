-- Módulo RH Angrybox: funcionários, turnos e pagamentos (MVP).
-- RLS ativo sem policies para anon/authenticated: acesso apenas via service role no backend.

-- -----------------------------------------------------------------------
-- 1. Funcionários
-- -----------------------------------------------------------------------
create table public.hr_employees (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text,
  phone          text,
  role_or_notes  text,
  status         text not null default 'active'
    check (status in ('active', 'inactive')),
  hired_at       timestamptz,
  ended_at       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.hr_employees is 'Angrybox RH: dados de funcionários';

create index if not exists idx_hr_employees_status on public.hr_employees (status);

alter table public.hr_employees enable row level security;

-- -----------------------------------------------------------------------
-- 2. Turnos (escalas)
-- -----------------------------------------------------------------------
create table public.hr_work_shifts (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.hr_employees (id) on delete restrict,
  work_date           date not null,
  start_time          time not null,
  end_time            time not null,
  location_or_station text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint hr_work_shifts_time_order check (start_time < end_time)
);

comment on table public.hr_work_shifts is 'Angrybox RH: turnos por dia civil';

create index if not exists idx_hr_work_shifts_work_date on public.hr_work_shifts (work_date);
create index if not exists idx_hr_work_shifts_employee_date
  on public.hr_work_shifts (employee_id, work_date);

alter table public.hr_work_shifts enable row level security;

-- -----------------------------------------------------------------------
-- 3. Pagamentos MVP
-- -----------------------------------------------------------------------
create table public.hr_employee_payments (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.hr_employees (id) on delete restrict,
  payment_date  date not null,
  amount        numeric(14, 2) not null,
  payment_type  text not null
    check (payment_type in ('salary', 'bonus', 'deduction', 'other')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.hr_employee_payments is 'Angrybox RH: registos de pagamento (MVP)';

create index if not exists idx_hr_employee_payments_employee on public.hr_employee_payments (employee_id);
create index if not exists idx_hr_employee_payments_date on public.hr_employee_payments (payment_date);

alter table public.hr_employee_payments enable row level security;
