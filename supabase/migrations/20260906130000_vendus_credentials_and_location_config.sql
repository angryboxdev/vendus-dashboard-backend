-- Vendus integration: per-organization credentials and per-location config
-- (.scratch/org-integration-credentials/spec.md, ticket 03). Replaces
-- VENDUS_API_KEY, VENDUS_REGISTER_ID/UBER_EATS_VENDUS_REGISTER_ID and the
-- four price-group/payment-method env vars as the source of truth for the
-- `vendus` module. Summary:
--
--   * vendus_credentials -- one row per organization, holding the Vendus API
--     key encrypted at the application layer (AES-256-GCM, ticket 01's
--     helper in src/infra/crypto/encryption.ts). A missing row means "this
--     organization has no Vendus integration configured" -- reported by the
--     port as not-configured, never thrown.
--   * vendus_location_config -- one row per (org_id, location_id), holding
--     the register id and the price-group/payment-method ids in plain
--     columns (non-secret, no encryption). Same composite-FK shape as
--     20260903072439_create_location_credentials_tables.sql -- scope by
--     construction, not by convention.
--
-- RLS is enabled with zero policies, matching organizations/locations/
-- location_tokens/pairing_codes: credential/config tables get the same
-- deny-by-default posture as the other identity-adjacent root tables. The
-- app's own access is via the service-role client (bypasses RLS) through
-- ScopedQuery, same as everywhere else.

create table "public"."vendus_credentials" (
  "org_id"             uuid not null,
  "encrypted_api_key"  text not null,
  "created_at"         timestamptz not null default now(),
  "updated_at"         timestamptz not null default now(),
  primary key ("org_id"),
  constraint "vendus_credentials_org_id_fkey"
    foreign key (org_id) references public.organizations (id)
);

alter table "public"."vendus_credentials" enable row level security;

create table "public"."vendus_location_config" (
  "org_id"                 uuid not null,
  "location_id"            uuid not null,
  "register_id"            text not null,
  "eatz_payment_id"        integer not null,
  "apps_payment_id"        integer not null,
  "salao_price_group_id"   integer not null,
  "eatz_price_group_id"    integer not null,
  "created_at"             timestamptz not null default now(),
  "updated_at"             timestamptz not null default now(),
  primary key ("org_id", "location_id"),
  constraint "vendus_location_config_org_id_location_id_fkey"
    foreign key (org_id, location_id) references public.locations (org_id, id)
);

alter table "public"."vendus_location_config" enable row level security;
