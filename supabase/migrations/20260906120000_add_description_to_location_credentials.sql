-- Location credentials (spec E, ticket 07): optional description. See
-- .scratch/location-credentials/issues/07-token-description.md. Summary:
--
--   * pairing_codes.description -- a free-text label an admin attaches at
--     generation time (e.g. "Kitchen monitor"), purely as a carrier between
--     generation and redemption, which are two separate requests. Opaque:
--     no identity or lookup semantics, not unique, nothing branches on it --
--     not the Device entity spec.md D3 rejected (README "No Device entity").
--   * location_tokens.description -- copied from the pairing code onto the
--     minted token by RedeemPairingCodeUseCase, so ListActiveTokensUseCase
--     can surface it later.
--
-- Both columns are nullable with no default, additive only, no backfill:
-- existing (already-paired) tokens keep description = null. The field is
-- write-once -- there is no update/rename endpoint in this ticket.

alter table "public"."pairing_codes" add column "description" text;

alter table "public"."location_tokens" add column "description" text;
