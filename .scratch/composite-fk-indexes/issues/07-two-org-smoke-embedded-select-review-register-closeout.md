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

**Status:** ready-for-agent

- [ ] Two-organization smoke covers every distinct target table across all
      four phase-2 batches, plus ticket 01's ranked subset in full
      (same-org write succeeds, sibling-org write rejected with a named
      constraint error, not an inconsistent HTTP status)
- [ ] The smoke is written up as a deliverable document, in the same
      manner as ticket 21's, not folded into the Jest suite
- [ ] Each of the 14 embedded selects reviewed: which relationship it
      follows, whether that relationship's composite FK phase actually
      covers it, and whether any row written before `VALIDATE CONSTRAINT`
      ran could hold a stale cross-organization reference
- [ ] Any embed still depending on one of the two named exceptions
      (`crm_customer_actions.created_by`, `bank_movement_entity_links`) is
      flagged explicitly, not marked reviewed-and-safe
- [ ] Deferred register (spec's Further Notes table) updated: composite
      FKs and composite indexes marked closed (minus the two named
      exceptions), everything else left as still open
- [ ] Explicitly recorded that this does not lift the hard gate — CRM
      keys, kiosk PIN, storage prefixing, and seed-template data remain
