-- AirMenu credentials & config (org-integration-credentials spec, ticket
-- 04): the AirMenu API key/username/password and the closing-enterprise-id
-- config, moved out of environment variables and into the database, one row
-- per organization (credentials) / one row per organization+location
-- (config). See .scratch/org-integration-credentials/issues/04-airmenu-credentials-and-config.md.
--
--   * airmenu_credentials -- one row per org_id. api_key/username/password
--     are stored encrypted (AES-256-GCM, src/infra/crypto/encryption.ts) --
--     never in plain text, unlike pairing_codes' short-lived plaintext code.
--   * airmenu_location_config -- one row per (org_id, location_id). Only
--     column is the AirMenu closing-enterprise id, used to fetch delivery
--     totals for a cash closing at that location. A plain column: it is not
--     a secret, just a reference to an AirMenu enterprise id.
--
-- Row *existence* is the "configured" signal for both tables (D: no
-- nullable secret/config columns) -- a missing row, not a null column, is
-- what "not configured" means. This mirrors the current optional behaviour
-- of AIRMENU_CLOSING_ENTERPRISE_ID (null today -> delivery totals stay null
-- in a cash closing): no row -> not-configured -> same downstream effect.
--
-- airmenu_location_config is keyed by (org_id, location_id) with a
-- composite FK to locations(org_id, id), exactly like location_tokens/
-- pairing_codes (20260903072439_create_location_credentials_tables.sql) --
-- scope-by-construction, not by convention (D18/story 18).
--
-- RLS is enabled with zero policies, matching location_tokens/pairing_codes/
-- organizations/locations/org_members: these are credential/config tables,
-- not ordinary business data, so they get the same deny-by-default posture
-- as the other identity-adjacent root tables rather than the RLS-deferred
-- posture of the tenant-scoped business tables (ADR-0007). The app's own
-- access is via the service-role client (bypasses RLS) through ScopedQuery,
-- same as everywhere else -- this only closes off a hypothetical direct
-- anon-key read.

create table "public"."airmenu_credentials" (
  "id"                  uuid not null default gen_random_uuid(),
  "org_id"              uuid not null,
  "api_key_encrypted"   text not null,
  "username_encrypted"  text not null,
  "password_encrypted"  text not null,
  "created_at"          timestamptz not null default now(),
  "updated_at"          timestamptz not null default now(),
  primary key ("id"),
  constraint "airmenu_credentials_org_id_key" unique ("org_id"),
  constraint "airmenu_credentials_org_id_fkey"
    foreign key (org_id) references public.organizations (id)
);

alter table "public"."airmenu_credentials" enable row level security;

create table "public"."airmenu_location_config" (
  "id"                     uuid not null default gen_random_uuid(),
  "org_id"                 uuid not null,
  "location_id"            uuid not null,
  "closing_enterprise_id"  text not null,
  "created_at"             timestamptz not null default now(),
  "updated_at"             timestamptz not null default now(),
  primary key ("id"),
  constraint "airmenu_location_config_org_id_location_id_key" unique ("org_id", "location_id"),
  constraint "airmenu_location_config_org_id_location_id_fkey"
    foreign key (org_id, location_id) references public.locations (org_id, id)
);

create index "airmenu_location_config_org_id_location_id_idx"
  on "public"."airmenu_location_config" ("org_id", "location_id");

alter table "public"."airmenu_location_config" enable row level security;
