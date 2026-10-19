-- Novo RH → Escalas: áreas de trabalho de cada centro (ex.: Sala, Caixa,
-- Cozinha) e a área de cada turno atribuído (opcional — turnos antigos ficam
-- «Sem área»). A área é da atribuição concreta, não do modelo de turno nem
-- do colaborador. Desativar uma área nunca apaga turnos nem histórico.
-- Rollback em docs/migrations/rollback/.

create table if not exists public.work_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_areas_org_id_uq unique (org_id, id),
  constraint work_areas_location_fk foreign key (org_id, location_id) references public.locations (org_id, id)
);

-- Dois nomes iguais (ativos) no mesmo centro confundem a escala.
create unique index if not exists work_areas_active_name_uq on public.work_areas (org_id, location_id, lower(btrim(name))) where active;
create index if not exists work_areas_location_idx on public.work_areas (org_id, location_id, sort_order);

alter table public.work_areas enable row level security;
drop policy if exists "work_areas: org-scoped all" on public.work_areas;
create policy "work_areas: org-scoped all" on public.work_areas for all to authenticated using (org_id = current_org()) with check (org_id = current_org());

-- Área do turno (rascunho). O estado publicado (JSONB `published`) leva `areaId` a partir de agora.
alter table public.roster_shifts add column if not exists area_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roster_shifts_area_fk') then
    alter table public.roster_shifts add constraint roster_shifts_area_fk foreign key (org_id, area_id) references public.work_areas (org_id, id);
  end if;
end $$;
create index if not exists roster_shifts_area_idx on public.roster_shifts (org_id, area_id) where area_id is not null;
