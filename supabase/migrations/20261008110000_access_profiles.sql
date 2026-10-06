-- Utilizadores & Perfis de Acesso 2.0 — ticket 02 (.scratch/utilizadores-perfis).
--
-- 1) `access_profiles`: Perfis de acesso por organização. `permissions` é o
--    mapa funcionalidade/permissão especial → NONE | READ | MANAGE (chave
--    ausente = NONE), validado pelo catálogo em código
--    (`src/modules/access/domain/catalog.ts`). `system_key` identifica os
--    perfis de sistema (Admin e Colaborador protegidos). Nunca se apagam —
--    só se desativam (`active`). `version` para concorrência otimista.
-- 2) `org_members`: `profile_id` (perfil atribuído), `permission_overrides`
--    (exceções individuais; chave ausente = herda do perfil), `status`
--    (active | disabled — desativar sem apagar) e `version`.
--    `role` mantém-se durante a transição (token hook / requireMinRole).
-- 3) Cria os 5 perfis de sistema em cada organização (valores gerados de
--    catalog.ts por scripts/generate-access-profiles-seed.ts) e atribui-os
--    aos membros existentes pelo papel atual: admin→Admin, manager→Manager,
--    hr_viewer→RH, employee→Colaborador. Sem exceções individuais.
--
-- 4) `organization_audit_logs` passa a aceitar `user` e `access_profile`.
--
-- Aditivo e reexecutável.

create table if not exists public.access_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  system_key text check (system_key in ('admin', 'manager', 'rh', 'financeiro', 'colaborador')),
  name text not null check (length(btrim(name)) > 0),
  description text,
  is_protected boolean not null default false,
  active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  version integer not null default 1,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_profiles_org_id_id_key unique (org_id, id)
);

create unique index if not exists access_profiles_org_name_uq on public.access_profiles (org_id, lower(btrim(name)));
create unique index if not exists access_profiles_org_system_key_uq on public.access_profiles (org_id, system_key) where system_key is not null;

alter table public.access_profiles enable row level security;

drop policy if exists "access_profiles: org-scoped all" on public.access_profiles;
create policy "access_profiles: org-scoped all"
  on public.access_profiles
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

alter table public.org_members
  add column if not exists profile_id uuid,
  add column if not exists permission_overrides jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'active',
  add column if not exists version integer not null default 1;

alter table public.org_members drop constraint if exists org_members_status_check;
alter table public.org_members add constraint org_members_status_check check (status in ('active', 'disabled'));
alter table public.org_members drop constraint if exists org_members_permission_overrides_check;
alter table public.org_members add constraint org_members_permission_overrides_check check (jsonb_typeof(permission_overrides) = 'object');
alter table public.org_members drop constraint if exists org_members_org_id_profile_id_fkey;
alter table public.org_members
  add constraint org_members_org_id_profile_id_fkey
  foreign key (org_id, profile_id) references public.access_profiles(org_id, id);

-- Perfis de sistema em cada organização (gerado de catalog.ts — não editar à mão).
insert into public.access_profiles (org_id, system_key, name, description, is_protected, permissions, created_by)
select o.id, v.system_key, v.name, v.description, v.is_protected, v.permissions, 'migração'
from public.organizations o
cross join (values
    ('admin', 'Admin', 'Acesso total ao sistema.', true, '{"company.calendar":"MANAGE","company.confidential_documents":"MANAGE","company.devices":"MANAGE","company.documents":"MANAGE","company.holidays":"MANAGE","company.locations":"MANAGE","company.organization":"MANAGE","company.positions":"MANAGE","crm.contacts":"MANAGE","crm.customers":"MANAGE","crm.settings":"MANAGE","dre.fixed_costs":"MANAGE","dre.statement":"MANAGE","dre.variable_costs":"MANAGE","finance.accounting":"MANAGE","finance.banking":"MANAGE","finance.cost_centers":"MANAGE","finance.invoices":"MANAGE","finance.payables":"MANAGE","finance.recurrences":"MANAGE","finance.suppliers":"MANAGE","hr.attendance":"MANAGE","hr.closure":"MANAGE","hr.documents":"MANAGE","hr.employees":"MANAGE","hr.history":"MANAGE","hr.kiosk_pin":"MANAGE","hr.leave":"MANAGE","hr.overview":"MANAGE","hr.payments":"MANAGE","hr.payslip_import":"MANAGE","hr.reopen_month":"MANAGE","hr.schedules":"MANAGE","hr.sensitive_data":"MANAGE","sales.air_menu":"MANAGE","sales.cash_closings":"MANAGE","sales.dashboard":"MANAGE","sales.results":"MANAGE","stock.count_confirm":"MANAGE","stock.counts":"MANAGE","stock.forecast_ops":"MANAGE","stock.invoice_imports":"MANAGE","stock.items":"MANAGE","stock.movements":"MANAGE","stock.planning":"MANAGE","stock.purchase_reviews":"MANAGE","stock.recipes":"MANAGE"}'::jsonb),
    ('manager', 'Manager', 'Gestão operacional: escalas, stock, CRM e vendas.', false, '{"company.calendar":"READ","company.devices":"READ","company.documents":"READ","company.holidays":"READ","company.locations":"READ","company.organization":"READ","company.positions":"READ","crm.contacts":"MANAGE","crm.customers":"MANAGE","crm.settings":"MANAGE","hr.attendance":"MANAGE","hr.documents":"READ","hr.employees":"READ","hr.leave":"MANAGE","hr.overview":"READ","hr.schedules":"MANAGE","sales.air_menu":"READ","sales.cash_closings":"READ","sales.dashboard":"READ","sales.results":"READ","stock.counts":"MANAGE","stock.invoice_imports":"MANAGE","stock.items":"MANAGE","stock.movements":"MANAGE","stock.planning":"MANAGE","stock.purchase_reviews":"MANAGE","stock.recipes":"MANAGE"}'::jsonb),
    ('rh', 'RH', 'Gestão de Recursos Humanos.', false, '{"company.calendar":"READ","company.devices":"READ","company.documents":"READ","company.holidays":"READ","company.locations":"READ","company.organization":"READ","company.positions":"MANAGE","hr.attendance":"MANAGE","hr.closure":"MANAGE","hr.documents":"MANAGE","hr.employees":"MANAGE","hr.history":"MANAGE","hr.leave":"MANAGE","hr.overview":"MANAGE","hr.payments":"MANAGE","hr.payslip_import":"MANAGE","hr.schedules":"READ","hr.sensitive_data":"MANAGE"}'::jsonb),
    ('financeiro', 'Financeiro', 'Gestão financeira e DRE.', false, '{"company.calendar":"READ","company.devices":"READ","company.documents":"READ","company.holidays":"READ","company.locations":"READ","company.organization":"READ","company.positions":"READ","dre.fixed_costs":"MANAGE","dre.statement":"MANAGE","dre.variable_costs":"MANAGE","finance.accounting":"MANAGE","finance.banking":"MANAGE","finance.cost_centers":"MANAGE","finance.invoices":"MANAGE","finance.payables":"MANAGE","finance.recurrences":"MANAGE","finance.suppliers":"MANAGE","hr.payments":"READ","sales.air_menu":"READ","sales.cash_closings":"READ","sales.dashboard":"READ","sales.results":"READ","stock.invoice_imports":"READ","stock.purchase_reviews":"READ"}'::jsonb),
    ('colaborador', 'Colaborador', 'Só o Portal do Colaborador.', true, '{}'::jsonb)
) as v(system_key, name, description, is_protected, permissions)
on conflict (org_id, system_key) where system_key is not null do nothing;

-- Membros existentes: perfil pelo papel atual (só quem ainda não tem perfil).
update public.org_members m
set profile_id = p.id
from public.access_profiles p
where p.org_id = m.org_id
  and m.profile_id is null
  and p.system_key = case m.role
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'hr_viewer' then 'rh'
    when 'employee' then 'colaborador'
  end;

-- Histórico (task §18): reutiliza `organization_audit_logs` para utilizadores
-- e perfis de acesso — sem tabela nova. Alarga o check de `entity_type`
-- (criado inline, por isso apaga-se qualquer check que o restrinja).
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.organization_audit_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%entity_type%'
  loop
    execute format('alter table public.organization_audit_logs drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.organization_audit_logs
  add constraint organization_audit_logs_entity_type_check
  check (entity_type in ('organization', 'user', 'access_profile'));
