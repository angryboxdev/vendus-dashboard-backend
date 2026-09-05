# AirMenu webhook signature enforcement

> Status: ready-for-agent
> Standalone bugfix — not part of any tenancy phase; no prerequisites.
> Identified while scoping `.scratch/location-credentials/` (spec E, D2) and
> `.scratch/` spec C: this is neither spec's job. See those specs' "Out of
> Scope" sections.

## Problem Statement

`src/modules/air-menu/adapters/in/air-menu.controller.ts`'s webhook handler
(`POST /api/air-menu/webhook/receive`) only rejects a signature **mismatch**.
A request with the `x-airmenu-signature` header missing entirely falls
through the same code path as a verified request:

```ts
if (this.webhookSecret) {
  if (typeof signature !== "string") {
    console.warn(`[AirMenu webhook] signature header missing ...`);
    // falls through — no res.status(401), no return
  } else {
    ...verify...
  }
}
```

So with `AIRMENU_WEBHOOK_SECRET` configured, anyone who can reach the
endpoint and simply omits the header bypasses verification entirely. This is
a bug in an existing mechanism (the webhook already has a notion of "which
integration is calling"), not a missing identity concept — no relation to
`UNATTENDED_SCOPE`, org/location scoping, or device credentials.

## Out of Scope

- Confirming the exact header name/format with AirMenu's docs (there's a
  pre-existing `TODO` in the file for that) — separate concern, not a
  security hole.
- Byte-exact raw-body verification (`JSON.stringify(req.body)` vs. the
  original bytes) — a pre-existing accuracy note in the same file, not a
  bypass.

## Acceptance Criteria

See `issues/01-enforce-signature-required.md`.
