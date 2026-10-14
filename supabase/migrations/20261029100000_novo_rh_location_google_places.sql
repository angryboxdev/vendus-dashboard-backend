-- Novo RH → Dashboard: ligação de cada local ao seu lugar no Google (Places)
-- para mostrar a nota e o número de avaliações. Só guarda o identificador
-- público do lugar (place_id) e o nome escolhido; a chave da API fica no
-- servidor (variável de ambiente). Rollback em docs/migrations/rollback/.

create table if not exists public.location_google_places (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null,
  place_id text not null check (length(place_id) between 3 and 300),
  place_name text not null check (length(btrim(place_name)) between 1 and 200),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  constraint location_google_places_org_id_uq unique (org_id, id),
  constraint location_google_places_location_uq unique (org_id, location_id),
  constraint location_google_places_location_fk foreign key (org_id, location_id) references public.locations (org_id, id)
);

alter table public.location_google_places enable row level security;
drop policy if exists "location_google_places: org-scoped all" on public.location_google_places;
create policy "location_google_places: org-scoped all" on public.location_google_places for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
