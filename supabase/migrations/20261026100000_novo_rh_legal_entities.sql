-- Novo RH (FE-092/FE-093): entidades legais empregadoras do grupo e a
-- entidade de cada centro. Só se arquivam (nunca se apagam). A ligação
-- centro → entidade vive numa tabela própria (a tabela locations não muda).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 2 and 160),
  country text not null check (country in ('PT', 'ES')),
  tax_id_type text not null check (tax_id_type in ('nif', 'cif', 'nie')),
  tax_id text not null check (tax_id ~ '^[0-9A-Z]{8,10}$'),
  social_security_id text not null check (social_security_id ~ '^[0-9]{11}$'),
  billing_email text not null check (length(billing_email) between 3 and 254),
  street text not null check (length(btrim(street)) between 2 and 200),
  postal_code text not null check (postal_code ~ '^([0-9]{4}-[0-9]{3}|[0-9]{5})$'),
  city text not null check (length(btrim(city)) between 2 and 80),
  region text not null check (length(btrim(region)) between 2 and 80),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_entities_org_id_uq unique (org_id, id),
  constraint legal_entities_tax_id_uq unique (org_id, country, tax_id)
);

create table if not exists public.legal_entity_locations (
  org_id uuid not null references public.organizations(id),
  location_id uuid not null,
  legal_entity_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, location_id),
  constraint legal_entity_locations_location_fk foreign key (org_id, location_id) references public.locations (org_id, id),
  constraint legal_entity_locations_entity_fk foreign key (org_id, legal_entity_id) references public.legal_entities (org_id, id)
);

-- Nunca apagar entidades (histórico fiscal).
create or replace function public.guard_legal_entities_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'legal_entities: as entidades legais não se apagam (arquive-as)';
end;
$$;
drop trigger if exists legal_entities_no_delete on public.legal_entities;
create trigger legal_entities_no_delete before delete on public.legal_entities
  for each row execute function public.guard_legal_entities_delete();

alter table public.legal_entities enable row level security;
alter table public.legal_entity_locations enable row level security;
drop policy if exists "legal_entities: org-scoped all" on public.legal_entities;
create policy "legal_entities: org-scoped all" on public.legal_entities for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "legal_entity_locations: org-scoped all" on public.legal_entity_locations;
create policy "legal_entity_locations: org-scoped all" on public.legal_entity_locations for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
