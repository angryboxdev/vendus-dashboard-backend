-- Novo RH — Fase 2 (Pessoas e contratos). ADR-0025: a ficha continua a ser
-- hr_employees (colunas novas, todas opcionais/com default — o RH atual não
-- muda); o resto em tabelas novas. Só acrescenta. Rollback em
-- docs/migrations/rollback/20261013100000_novo_rh_people.sql.

-- ── Ficha: colunas novas ──────────────────────────────────────────────
alter table public.hr_employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists gender text,
  add column if not exists personal_email text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists currency text not null default 'EUR',
  add column if not exists pay_period text not null default 'monthly',
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text,
  add column if not exists record_version integer not null default 1;

alter table public.hr_employees drop constraint if exists hr_employees_currency_ck;
alter table public.hr_employees add constraint hr_employees_currency_ck check (currency ~ '^[A-Z]{3}$');
alter table public.hr_employees drop constraint if exists hr_employees_pay_period_ck;
alter table public.hr_employees add constraint hr_employees_pay_period_ck check (pay_period in ('monthly', 'biweekly', 'weekly'));

-- D4: NIF único por organização (normalizado). Verificado sem duplicados em 2026-10-11.
create unique index if not exists hr_employees_org_nif_uq
  on public.hr_employees (org_id, upper(regexp_replace(nif, '\s', '', 'g')))
  where nif is not null and btrim(nif) <> '';

-- Centros com vigência (transferências — CF-2, TK-10): as pertenças da Fase 1 passam a aceitar 'location'.
alter table public.employee_org_assignments drop constraint if exists employee_org_assignments_unit_type_check;
alter table public.employee_org_assignments
  add constraint employee_org_assignments_unit_type_check check (unit_type in ('department', 'group', 'location'));

-- ── Convénios (C3.10) ─────────────────────────────────────────────────
create table if not exists public.collective_agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 160),
  code text check (code is null or length(code) <= 40),
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint collective_agreements_org_id_id_key unique (org_id, id)
);
create unique index if not exists collective_agreements_name_uq on public.collective_agreements (org_id, lower(btrim(name))) where not archived;

-- ── Contratos (TK-9: sem sobreposição) ────────────────────────────────
create table if not exists public.employment_contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  contract_type text not null check (contract_type in ('permanent', 'fixed_term', 'temporary', 'internship', 'other')),
  code text check (code is null or length(code) <= 40),
  start_date date not null,
  end_date date,
  seniority_date date,
  probation_end date,
  weekly_hours numeric(5, 2) check (weekly_hours is null or (weekly_hours > 0 and weekly_hours <= 80)),
  fte numeric(4, 3) check (fte is null or (fte > 0 and fte <= 1)),
  agreement_id uuid,
  remote boolean not null default false,
  comment text check (comment is null or length(comment) <= 500),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  version integer not null default 1,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employment_contracts_period_ck check (end_date is null or end_date >= start_date),
  constraint employment_contracts_probation_ck check (probation_end is null or probation_end >= start_date),
  constraint employment_contracts_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint employment_contracts_agreement_fk foreign key (org_id, agreement_id) references public.collective_agreements (org_id, id)
);
create index if not exists employment_contracts_org_employee_idx on public.employment_contracts (org_id, employee_id, start_date);

-- Rede na BD contra contratos ativos sobrepostos (a aplicação devolve 409 antes).
create or replace function public.employment_contracts_no_overlap() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.employment_contracts c
     where c.org_id = new.org_id and c.employee_id = new.employee_id and c.id <> new.id and c.status = 'active'
       and daterange(c.start_date, c.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'employment_contracts: contratos sobrepostos para o mesmo colaborador' using errcode = '23P01';
  end if;
  return new;
end;
$$;
drop trigger if exists employment_contracts_no_overlap on public.employment_contracts;
create trigger employment_contracts_no_overlap before insert or update on public.employment_contracts
  for each row execute function public.employment_contracts_no_overlap();

-- ── Responsáveis e validadores ────────────────────────────────────────
create table if not exists public.employee_managers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  manager_employee_id uuid not null,
  kind text not null check (kind in ('direct', 'approver_time', 'approver_leave')),
  level smallint not null default 1 check (level between 1 and 3),
  valid_from date not null,
  valid_to date,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint employee_managers_not_self check (manager_employee_id <> employee_id),
  constraint employee_managers_period_ck check (valid_to is null or valid_to >= valid_from),
  constraint employee_managers_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint employee_managers_manager_fk foreign key (org_id, manager_employee_id) references public.hr_employees (org_id, id)
);
create index if not exists employee_managers_org_employee_idx on public.employee_managers (org_id, employee_id);

-- ── Complementos e benefícios (C3.8, CF-14) ───────────────────────────
create table if not exists public.compensation_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('complement', 'benefit')),
  name text not null check (length(btrim(name)) between 1 and 120),
  code text check (code is null or length(code) <= 40),
  mode text not null check (mode in ('fixed', 'variable', 'employee', 'services', 'copayment')),
  amount numeric(12, 2) not null check (amount >= 0),
  employee_amount numeric(12, 2) check (employee_amount is null or employee_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  pay_period text not null default 'monthly' check (pay_period in ('monthly', 'biweekly', 'weekly')),
  every_n_months smallint not null default 1 check (every_n_months between 1 and 12),
  active boolean not null default true,
  comment text check (comment is null or length(comment) <= 500),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint compensation_items_org_id_id_key unique (org_id, id),
  constraint compensation_items_mode_ck check ((kind = 'complement' and mode in ('fixed', 'variable')) or (kind = 'benefit' and mode in ('employee', 'services', 'copayment')))
);
create unique index if not exists compensation_items_name_uq on public.compensation_items (org_id, kind, lower(btrim(name))) where active;

create table if not exists public.employee_compensations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  item_id uuid not null,
  amount numeric(12, 2) check (amount is null or amount >= 0),
  valid_from date not null,
  valid_to date,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint employee_compensations_period_ck check (valid_to is null or valid_to >= valid_from),
  constraint employee_compensations_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint employee_compensations_item_fk foreign key (org_id, item_id) references public.compensation_items (org_id, id)
);
create index if not exists employee_compensations_org_employee_idx on public.employee_compensations (org_id, employee_id);

-- ── Campos personalizados (C3.9) ──────────────────────────────────────
create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  section text not null check (section in ('personal', 'work', 'custom')),
  name text not null check (length(btrim(name)) between 1 and 80),
  format text not null check (format in ('text', 'options')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  sensitive boolean not null default false,
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint custom_field_definitions_org_id_id_key unique (org_id, id)
);
create unique index if not exists custom_field_definitions_name_uq on public.custom_field_definitions (org_id, lower(btrim(name))) where not archived;

create table if not exists public.employee_custom_values (
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  field_id uuid not null,
  value text check (value is null or length(value) <= 1000),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, employee_id, field_id),
  constraint employee_custom_values_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint employee_custom_values_field_fk foreign key (org_id, field_id) references public.custom_field_definitions (org_id, id)
);

-- ── RLS org-claim ─────────────────────────────────────────────────────
alter table public.collective_agreements enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.employee_managers enable row level security;
alter table public.compensation_items enable row level security;
alter table public.employee_compensations enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.employee_custom_values enable row level security;

drop policy if exists "collective_agreements: org-scoped all" on public.collective_agreements;
create policy "collective_agreements: org-scoped all" on public.collective_agreements for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "employment_contracts: org-scoped all" on public.employment_contracts;
create policy "employment_contracts: org-scoped all" on public.employment_contracts for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "employee_managers: org-scoped all" on public.employee_managers;
create policy "employee_managers: org-scoped all" on public.employee_managers for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "compensation_items: org-scoped all" on public.compensation_items;
create policy "compensation_items: org-scoped all" on public.compensation_items for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "employee_compensations: org-scoped all" on public.employee_compensations;
create policy "employee_compensations: org-scoped all" on public.employee_compensations for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "custom_field_definitions: org-scoped all" on public.custom_field_definitions;
create policy "custom_field_definitions: org-scoped all" on public.custom_field_definitions for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "employee_custom_values: org-scoped all" on public.employee_custom_values;
create policy "employee_custom_values: org-scoped all" on public.employee_custom_values for all to authenticated using (org_id = current_org()) with check (org_id = current_org());

-- ── Catálogo de acessos: exportar colaboradores (especial) ─────────────
update public.access_profiles set permissions = permissions || '{"hr.people_export": "MANAGE"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'admin';
update public.access_profiles set permissions = permissions || '{"hr.people_export": "MANAGE"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'rh';
