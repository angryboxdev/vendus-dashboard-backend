# 03 — Tenant root tables and the Angrybox seed

Status: open
Blocked by: 01
Spec: `../spec.md` (D9)

## Problem

`org_id` and `location_id` are foreign keys; something has to hold the rows they
point at. This is the first migration of the whole effort — issue 06 cannot
stamp Angrybox's `org_id` before an Angrybox org row exists.

## Work

One migration creating:

```sql
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
```

Seed one organization from `src/config/company.ts` — name `Angrybox`, NIF
`518902609`, the Arcozelo address, `general@angrybox.pt` — and one location.
**Use a fixed UUID for both**, written into the migration: issue 06's column
defaults reference the org id, and issue 04's `DEFAULT_ORG_ID` constant must
match it.

Both tables get RLS enabled with **no policies** — deny-by-default until spec B
adds the membership-based ones (§2.7).

## Design notes

- No `slug`, no `status`. Nothing in v1 reads either; both are one-line additions
  later against a single row. `slug` serves white-label subdomains (phase 11);
  `status`'s only real consumer is an RLS predicate, which is spec B's to design.
- `nif` is `NOT NULL UNIQUE` because §2.3 makes one NIF the definition of the org
  boundary. Consequence, deliberate: no org can exist before its NIF is known.
- `timezone` is on `locations`, not `organizations` — the service day closes ~2am,
  so the boundary follows the store's wall clock, and Portugal spans three offsets.
- `organizations` is the one table that never gets an `org_id`; its `id` *is* the
  org id.

## Done when

- [x] Both tables exist with the shape above
- [x] Exactly one organization row and one location row, with fixed UUIDs
- [x] RLS enabled, zero policies, on both
- [ ] `supabase db reset` reproduces them

Verified by applying `supabase/migrations/20260822143602_tenant_root_tables.sql`
directly against the shared local DB inside a `BEGIN;`/`ROLLBACK;` transaction
(via `docker exec ... psql`, since `psql`/`supabase db reset` weren't safe to
run here — a sibling agent is using the same local DB for ticket 02). Confirmed:
table shapes, constraints (`organizations_nif_key`, `locations_org_id_code_key`,
`locations_org_id_fkey`), exactly one row per table with the fixed UUIDs, RLS
enabled (`relrowsecurity = t`) with zero rows in `pg_policies`. Rolled back
cleanly, so the shared DB was left untouched. The last box (`supabase db reset`
reproducing this from a fresh DB, alongside ticket 02's migration) is left for
the orchestrator's final integration reset.
