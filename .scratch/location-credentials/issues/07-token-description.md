# 07 — Optional description on pairing codes and location tokens

**What to build:** An org admin can attach a free-text description (e.g. "Kitchen
monitor", "Reception tablet") when generating a pairing code, so that a later listing
of active tokens says which physical device each one is — without modeling a Device
entity.

- `POST /location-credentials/pairing-codes` accepts an optional `description` in the
  request body: trimmed, 1–100 chars if present, rejected if whitespace-only. Omitted
  → stored as `null`. Response echoes it back: `{ code, expiresAt, description }`.
- `description` is added to the `pairing_codes` table (new additive migration,
  nullable column) purely as a carrier between the two separate requests (generation,
  then redemption) — there is no other channel for that value to reach the token,
  since redemption is a different actor, possibly minutes later, identified only by
  the code string.
- `RedeemPairingCodeUseCase` copies `description` from the `PairingCode` onto the new
  `LocationToken`, the same way it already copies `organizationId`/`locationId`.
  `description` is added to the `location_tokens` table (same migration).
- `ListActiveTokensUseCase`'s `LocationTokenDto` gains `description` alongside the
  existing `locationName`.
- The field is write-once: no update/rename endpoint in this ticket. Fixing a typo
  means revoking and re-pairing. Existing (already-paired) tokens keep `description:
  null` — this migration does not backfill.
- Amend the module README's "No Device entity (spec.md D3, story 33)" section: note
  that `description` is a plain opaque label with no identity or lookup semantics — it
  cannot be used to look anything up, it is not unique, and nothing branches on its
  value — so it is not the Device entity D3 rejected. A future "which screen is this,
  actually identify it" request is still a new domain concept, unaddressed by this
  field.
- Add `description` to `CONTEXT.md`'s Pairing Code / Location Token entries.
- **Flag for the frontend repo (ticket 05, not yet shipped):** the pairing-code
  generation form should offer this input, and the active-tokens list should display
  it — see the note added to ticket 05.

This does not touch `spec.md`'s decision log (D1–D15) — it's treated as a narrow,
additive follow-up to the shipped module, not a reopening of D3's core claim (no
Device entity, no per-physical-device attribution beyond a label).

**Blocked by:** 01

**Status:** done

- [x] New migration adds nullable `description` column to both `pairing_codes` and
      `location_tokens`, additive only, no backfill.
- [x] `PairingCode` and `LocationToken` domain entities carry `description` (nullable),
      via both `create` and `reconstitute`.
- [x] `GeneratePairingCodeUseCase`/port accepts optional `description`, validates it
      (trimmed, 1–100 chars, rejects whitespace-only), passes it to `PairingCode.create`.
- [x] `RedeemPairingCodeUseCase` copies `description` from the pairing code onto the
      minted `LocationToken`.
- [x] `ListActiveTokensUseCase`'s `LocationTokenDto` includes `description`.
- [x] `POST /location-credentials/pairing-codes` accepts optional `description` in the
      body and echoes it in the `201` response.
- [x] Both Supabase repository adapters' insert/select column lists are updated; the
      integration test covers round-tripping `description` (present and `null`).
- [x] Unit tests updated/added: entity tests (`description` on create/reconstitute),
      `generate-pairing-code` (valid, omitted, whitespace-only, too-long), 
      `redeem-pairing-code` (description carried over), `list-active-tokens`
      (`description` present in DTO, `null` when not set).
- [x] README's D3 section amended with the distinction described above.
- [x] `CONTEXT.md` updated with `description` on both entities.

## Comments

Follow-up from `/grill-with-docs` on `.scratch/location-credentials/spec.md`. Full
decision trail: field is opaque/write-once by design (D3 override scoped narrowly),
captured at generation by the admin (not at redemption by the screen), carried through
`pairing_codes` because generation and redemption are separate requests.
