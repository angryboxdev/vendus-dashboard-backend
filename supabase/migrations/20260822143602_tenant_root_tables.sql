-- Tenant root tables: organizations and locations.
--
-- These are the rows that org_id / location_id foreign keys (introduced in
-- later migrations of this effort) point at. See
-- .scratch/org-location-foundation/spec.md D9 for the rationale behind the
-- shape below (no slug, no status, nif is the org boundary, timezone lives
-- on locations not organizations).
--
-- RLS is enabled on both tables with zero policies -- deny-by-default until
-- spec B adds the membership-based policies (see spec.md §2.7).

create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  nif        text not null unique,
  address    text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table locations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id),
  name       text not null,
  code       text not null,
  address    text,
  timezone   text not null default 'Europe/Lisbon',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

alter table organizations enable row level security;
alter table locations enable row level security;

-- Seed: Angrybox, the one real organization and location as of this
-- migration. Fixed UUIDs so later migrations (issue 04's DEFAULT_ORG_ID,
-- issue 06's column defaults) can reference them directly. Values sourced
-- from src/config/company.ts.
insert into organizations (id, name, nif, address, email)
values (
  'b6999cff-79b2-4583-b8b4-a744b3ace748',
  'Angrybox',
  '518902609',
  'Rua António Paes, 41, 1º Esquerdo Posterior 4410-485 Arcozelo',
  'general@angrybox.pt'
);

insert into locations (id, org_id, name, code, address, is_active)
values (
  'c11d9146-fe16-4afb-9877-75e75bb2f52a',
  'b6999cff-79b2-4583-b8b4-a744b3ace748',
  'Arcozelo',
  'ARCOZELO',
  'Rua António Paes, 41, 1º Esquerdo Posterior 4410-485 Arcozelo',
  true
);
