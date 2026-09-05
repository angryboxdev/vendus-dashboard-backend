# 02 — Fan-out foundation: generic per-item utility + org/location listing

**What to build:** The shared mechanism both crons will use to process every
organization (or organization/location pair) instead of one hardcoded pair —
built once, used twice. Two independent pieces:

1. A generic fan-out utility: given a list of items and a per-item async
   function, it processes each item independently, treats a "not configured"
   result as a skip (not an error), catches and logs any other per-item
   failure without stopping the remaining items, and returns a summary of
   what succeeded, what was skipped, and what failed.
2. Queries to list every organization, and every `(org, location)` pair —
   nothing in this codebase currently lists organizations at all, so this is
   new, not a refactor.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] The fan-out utility accepts a list of items and a per-item processor,
      and returns a summary distinguishing succeeded / skipped / failed
      items.
- [ ] An item whose processor reports "not configured" is recorded as
      skipped, not failed.
- [ ] One item's thrown error is caught, logged, and recorded as failed
      without preventing the remaining items from being processed.
- [ ] A query lists every row in `organizations`.
- [ ] A query lists every `(org_id, location_id)` pair across `locations`.
- [ ] Unit tests cover the fan-out utility's skip/isolate/summarize behavior
      using fakes — no DB involved for this ticket's utility test; the
      listing queries get a light integration test against the local stack.
