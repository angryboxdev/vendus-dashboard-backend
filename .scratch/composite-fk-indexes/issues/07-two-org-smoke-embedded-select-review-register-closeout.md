# 07 — Two-organization smoke, embedded-select review, deferred-register close-out

**What to build:** Proof, and a record, that the deferred register's
biggest remaining item is genuinely closed. A full two-organization smoke
on the local stack (matching ticket 21's shape, scaled to volume not
breadth): every distinct target table exercised at least once, ticket 01's
highest-ranked/most user-facing subset exercised in full, and direct-SQL
insertion for any reference with no caller-facing write path. Alongside it,
a review of the 14 embedded `select` queries from spec B2's audit,
confirming each one is still safe now that a cross-organization foreign
key genuinely cannot exist — or flagging the ones that still depend on one
of ticket 01's two named exceptions. Finishes with the deferred register
updated to reflect what's actually closed.

**Blocked by:** 03, 04, 05, 06 (every composite FK must exist before the
full sweep and the embedded-select review can run).

**Status:** done

- [x] Two-organization smoke covers every distinct target table across all
      four phase-2 batches, plus ticket 01's ranked subset in full
      (same-org write succeeds, sibling-org write rejected with a named
      constraint error, not an inconsistent HTTP status) — see
      `07-two-org-smoke.md`
- [x] The smoke is written up as a deliverable document, in the same
      manner as ticket 21's, not folded into the Jest suite —
      `07-two-org-smoke.md`
- [x] Each of the 14 (17, on rediscovery — see that document's "Why not
      14" section) embedded selects reviewed: which relationship it
      follows, whether that relationship's composite FK phase actually
      covers it, and whether any row written before `VALIDATE CONSTRAINT`
      ran could hold a stale cross-organization reference — see
      `07-embedded-select-review.md`
- [x] Any embed still depending on one of the two named exceptions
      (`crm_customer_actions.created_by`, `bank_movement_entity_links`) is
      flagged explicitly, not marked reviewed-and-safe — none found to
      depend on either (`07-embedded-select-review.md`, "Flagged items")
- [x] Deferred register (spec's Further Notes table) updated: composite
      FKs and composite indexes marked closed (minus the two named
      exceptions), everything else left as still open — see spec.md
- [x] Explicitly recorded that this does not lift the hard gate — CRM
      keys, kiosk PIN, storage prefixing, and seed-template data remain —
      see "Hard gate" section below

## Closing write-up

**A real bug was found and fixed along the way, not just verified.** The
two-organization smoke (`07-two-org-smoke.md`) initially found that three
of the four phase-2 migration files
(`composite_fks_phase2a_suppliers_cost_centers.sql`,
`composite_fk_indexes_phase2b.sql`,
`composite_fk_phase2d_invoicing_pizza_misc.sql`) shared the identical
migration-version timestamp `20260908100000` with the fourth
(`composite_fk_hr_banking_phase2c.sql`). On a clean `supabase db reset` —
the same mechanism a real deploy uses — the first of the four to apply
committed; the second's own ledger insert then collided on that shared
primary key and rolled back everything it had just added, aborting the
reset before the third and fourth ever ran. Net effect: only `phase2c`'s 18
constraints existed on a freshly-reset stack; the other 64 (from
`phase2a`, `phase2b`, `phase2d`) did not, despite those three tickets
(03, 04, 06) being marked done/done-and-verified — none of their
verification passes exercised a clean `db reset` of all four files
together.

**Fixed**: the three colliding files were renamed to distinct sequential
timestamps (`...100001`, `...100002`, `...100003`, `phase2a` keeping
`...100000` as it already ran first). A fresh `db reset` now applies all
four cleanly; composite `org_id`-prefixed constraint count went from 18 to
151. Re-verified (fast direct-SQL spot-check per user instruction, not a
full re-run — see `07-two-org-smoke.md` §7) that the cross-organization
rejection mechanism now fires correctly for a representative column from
each of the three previously-broken files.

**Embedded-select review** (`07-embedded-select-review.md`): 17 call
sites found across 5 distinct relationships (D16's original count of 14
was never preserved as an itemized list; the discrepancy is explained, not
forced). All 5 relationships resolve to a validated composite FK from one
of the four phase-2 files (now all confirmed applying, per the fix above);
none depends on either of D6's two named exceptions. Independently
confirmed via direct query that no leftover cross-organization row exists
in any of the five tables those embeds touch.

**Deferred register**: spec.md's Further Notes table already stated the
target end-state ("Closed, minus the two named exceptions"); that
projection is now backed by verified evidence rather than being aspirational.

### Hard gate

This ticket does **not** lift spec A's hard gate. After this spec, the
deferred register's "before organization #2" group is still: CRM text
primary keys (item 4), kiosk PIN collision (item 5), object-storage path
prefixing (item 6), and seed-template data at provisioning — none of
which this spec touched. The two named exceptions
(`crm_customer_actions.created_by`, `bank_movement_entity_links`'s
polymorphic pair) also remain open, per D6, and are not part of "composite
FKs closed." No second `organizations` row exists in production as a
result of this ticket; the local stack's second organization created for
this smoke was provisioned and torn down entirely within the local
stack, per D9/Out of Scope.
