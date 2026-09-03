-- Location credentials (spec E, ticket 01): pairing codes and location
-- tokens. See .scratch/location-credentials/spec.md D3-D7 for the full
-- rationale. Summary:
--
--   * pairing_codes -- short-lived, single-use codes an admin generates to
--     bring a new screen online (D6). code is stored in plain text: it is
--     human-enterable, expires within minutes and is burned on first
--     redemption attempt regardless of outcome, so the exposure window is
--     the same one the admin already sees it in.
--   * location_tokens -- the persistent, opaque credential a screen holds
--     after redeeming a code (D5). token_hash only -- the raw token is
--     returned to the caller exactly once, at redemption, and never stored.
--     Revoking a screen is a plain row delete (Solution section) -- no
--     rotation, no blocklist, no effect on any sibling token.
--
-- Both tables are keyed by (org_id, location_id) with a composite FK to
-- locations(org_id, id), exactly like the five tables
-- 20260831152632_drop_defaults_and_location_composite_keys.sql covers --
-- scope-by-construction, not by convention (D18/story 18). No column
-- default on org_id/location_id: these are new tables, so there is no
-- scaffold default to carry forward -- every write already goes through the
-- module's own use cases, which always know the organization and location.
--
-- RLS is enabled with zero policies, matching organizations/locations/
-- org_members: these are credential tables, not ordinary business data, so
-- they get the same deny-by-default posture as the other identity-adjacent
-- root tables rather than the RLS-deferred posture of the 55 tenant-scoped
-- business tables (ADR-0007). The app's own access is via the service-role
-- client (bypasses RLS) through ScopedQuery/the unscoped-door lookups, same
-- as everywhere else -- this only closes off a hypothetical direct anon-key
-- read.

create table "public"."pairing_codes" (
  "id"          uuid not null default gen_random_uuid(),
  "org_id"      uuid not null,
  "location_id" uuid not null,
  "code"        text not null,
  "expires_at"  timestamptz not null,
  "burned_at"   timestamptz,
  "created_at"  timestamptz not null default now(),
  primary key ("id"),
  constraint "pairing_codes_code_key" unique ("code"),
  constraint "pairing_codes_org_id_location_id_fkey"
    foreign key (org_id, location_id) references public.locations (org_id, id)
);

create index "pairing_codes_org_id_location_id_idx"
  on "public"."pairing_codes" ("org_id", "location_id");

alter table "public"."pairing_codes" enable row level security;

create table "public"."location_tokens" (
  "id"          uuid not null default gen_random_uuid(),
  "org_id"      uuid not null,
  "location_id" uuid not null,
  "token_hash"  text not null,
  "issued_at"   timestamptz not null default now(),
  primary key ("id"),
  constraint "location_tokens_token_hash_key" unique ("token_hash"),
  constraint "location_tokens_org_id_location_id_fkey"
    foreign key (org_id, location_id) references public.locations (org_id, id)
);

create index "location_tokens_org_id_location_id_idx"
  on "public"."location_tokens" ("org_id", "location_id");

alter table "public"."location_tokens" enable row level security;
