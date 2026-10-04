-- Base Organizacional 1.0 — tickets 07 "Cargos" e 08 "Local principal"
-- (.scratch/base-organizacional).
--
-- 1) Cargos (`hr_positions`). Substituem a "Função" fixa (enum
--    `hr_employees.job_role`: manager|prep|service). Decisão D4 da spec:
--    cada Cargo tem uma `operational_category` (os mesmos 3 valores) usada
--    pelas Escalas (rotações) e pelas categorias de documentos até estas
--    migrarem; `hr_employees.job_role` mantém-se em paralelo, sempre igual à
--    categoria do cargo do colaborador, e só será removido após validação
--    (task §17). Cargo ≠ permissão: nada aqui toca em `org_members`.
--
--    `normalized_name` é gerado pela BD (minúsculas, sem espaços a mais) e é
--    único por organização — "Preparador"/"preparador"/" PREPARADOR " são
--    sempre o mesmo cargo (teste crítico "Cargo duplicado" da task).
--
-- 2) Migração Função → Cargo, sem perda: cria por organização os 3 cargos
--    equivalentes aos valores do enum (com os nomes que a UI já mostrava) e
--    liga cada colaborador ao cargo da sua função atual.
--
-- 3) Local principal (`primary_location_id`) e outros locais autorizados
--    (`hr_employee_locations`), ambos por FK composta `(org_id, …)` — nunca
--    texto livre (task §15).
--
-- Tudo aditivo e reexecutável.

-- ── 1) Cargos ─────────────────────────────────────────────────────────────

create table if not exists public.hr_positions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  description text,
  operational_category text not null check (operational_category in ('manager', 'prep', 'service')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_positions_org_id_id_key unique (org_id, id),
  constraint hr_positions_org_id_normalized_name_key unique (org_id, normalized_name)
);

alter table public.hr_positions enable row level security;

drop policy if exists "hr_positions: org-scoped all" on public.hr_positions;
create policy "hr_positions: org-scoped all"
  on public.hr_positions
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- ── 2) Migração Função → Cargo ────────────────────────────────────────────

insert into public.hr_positions (org_id, name, operational_category)
select o.id, v.name, v.category
from public.organizations o
cross join (values ('Gerente', 'manager'), ('Preparador', 'prep'), ('Serviço', 'service')) as v(name, category)
on conflict (org_id, normalized_name) do nothing;

alter table public.hr_employees
  add column if not exists position_id uuid,
  add column if not exists primary_location_id uuid;

alter table public.hr_employees
  drop constraint if exists hr_employees_org_id_position_id_fkey;
alter table public.hr_employees
  add constraint hr_employees_org_id_position_id_fkey
  foreign key (org_id, position_id) references public.hr_positions (org_id, id);

alter table public.hr_employees
  drop constraint if exists hr_employees_org_id_primary_location_id_fkey;
alter table public.hr_employees
  add constraint hr_employees_org_id_primary_location_id_fkey
  foreign key (org_id, primary_location_id) references public.locations (org_id, id);

-- Só preenche quem ainda não tem cargo — reexecutar nunca sobrepõe uma
-- escolha feita depois na aplicação. Escolhe o cargo seed da categoria
-- (nome exato), nunca um cargo criado pelo utilizador com a mesma categoria.
update public.hr_employees e
set position_id = p.id
from public.hr_positions p
where e.position_id is null
  and p.org_id = e.org_id
  and p.operational_category = e.job_role
  and p.name = case e.job_role when 'manager' then 'Gerente' when 'prep' then 'Preparador' else 'Serviço' end;

-- ── 3) Outros locais autorizados ──────────────────────────────────────────

create table if not exists public.hr_employee_locations (
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (employee_id, location_id),
  constraint hr_employee_locations_org_id_employee_id_fkey
    foreign key (org_id, employee_id) references public.hr_employees (org_id, id) on delete cascade,
  constraint hr_employee_locations_org_id_location_id_fkey
    foreign key (org_id, location_id) references public.locations (org_id, id)
);

create index if not exists hr_employee_locations_org_location_idx
  on public.hr_employee_locations (org_id, location_id);

alter table public.hr_employee_locations enable row level security;

drop policy if exists "hr_employee_locations: org-scoped all" on public.hr_employee_locations;
create policy "hr_employee_locations: org-scoped all"
  on public.hr_employee_locations
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
