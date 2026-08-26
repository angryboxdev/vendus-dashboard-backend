# 03 — Convert `cash-closings` (validates the location and unattended-scope decisions)

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D3, D4, D6, D14), ADR-0009

## Problem

`cash-closings` is the only module that exercises every hard decision in this spec
at once: a location-bearing table, an unauthenticated public write route, and a
caller with no auth payload. It is converted third, on purpose, so that a mistake
in D4 or D6 surfaces while the foundation is still cheap to change rather than
after fifteen modules have been built against it.

It is also the module whose legacy twin is dead: the old service (7 query sites)
is imported only by a route file that is not mounted.

## Work

1. **Convert the module** following ticket 02's pattern: ports take the
   organization, adapters use the helper, use cases carry it, controller supplies
   it.
2. **The public routes take their scope from the unattended scope** (D14): PIN
   verification, the sessions listing and the closing submit have no
   authenticated user, so they resolve both organization and location from the
   named file, not from the request.
3. **The PIN lookup becomes organization-scoped.** It currently searches every
   employee in the database. Scoped to the unattended organization it is correct
   by construction while one organization exists. The four-digit collision hazard
   across organizations is *not* fixed here — it is spec A's deferred item, and
   the register records it.
4. **The closing write supplies a location explicitly** — from the unattended
   scope, since the submitting client is unauthenticated. It must not rely on the
   column default.
5. **The managed routes** (list, get, review) take the organization from the auth
   payload as normal.
6. **Convert the dead legacy pair too** — the unmounted route file and the service
   only it imports, 7 sites (D9). They are kept, so they are scoped.
7. **Update the module README.**

## Not in scope

No rate limiting, no second factor on the submit route — both are pre-existing
gaps recorded in the spec and belong with device identity. No change to the kiosk
or closing screens. No column default dropped.

## Notes

- **This is the ticket that tests the design.** If supplying a location from the
  unattended scope feels wrong here, or if the split between "unattended path" and
  "authenticated path" does not fall cleanly, raise it in the comments before
  proceeding — that is the whole reason this module is third and not fifteenth.
- The kiosk and the closing screen are public routes in the same single front-end
  application; there is no separate build and no per-device configuration. That is
  why the device has no identity to draw a location from. See D14.
- The employee PIN is the credential; employees are not accounts. Nothing here
  changes that.

## Done when

- [ ] Every `cash-closings` output port method takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The public routes resolve organization and location from the unattended scope
- [ ] The closing write supplies a location explicitly rather than relying on the
      column default
- [ ] The PIN lookup is organization-scoped
- [ ] The managed routes take the organization from the auth payload
- [ ] The dead route file and its service are converted, not deleted
- [ ] The module imports no Supabase client and no Supabase package
- [ ] Existing tests pass; the closing flow behaves identically end to end
- [ ] The module README reflects the new signatures and the unattended-path rule
