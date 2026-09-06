# 19 — Front end: consume the locations endpoint, send the location on write payloads

Status: done
Blocked by: 10, 17, 18
Spec: `../spec.md` (D4, D15, Cross-repository contract), ADR-0009

## Problem

D4 makes the location a caller-supplied value on authenticated write requests.
The front end has no location concept at all today, and until ticket 01 there was
no endpoint that could give it one.

This is the increment that must land **before** the final migration. When ticket
21 drops the column defaults, a write that does not name a location fails — so if
the front end is not already sending one, every stock movement, work shift and
attendance write breaks at once. That is the single failure mode of this spec
that users would notice.

Repository: `~/projects/vendus-dashboard-frontend`. Note that CLAUDE.md's path for
it is stale.

## Work

1. **Fetch the organization's locations** from the endpoint added in ticket 01,
   once, and hold them in the session context alongside the organization the
   session already carries.
2. **Send the location on the authenticated write requests** that now accept one:
   stock movement creation and update, work shift creation and update, shift
   attendance, and invoice lines.
3. **Show a picker only when the organization has more than one location.** With
   one, the value is implicit and the interface is unchanged — which is Angrybox's
   case, so this must cost the current user zero extra clicks.
4. **Invoice lines keep the location optional.** A cost belonging to the whole
   organization and to no store is a real state; the interface must allow leaving
   it unset rather than defaulting it to the first store.
5. **Do not touch the kiosk or till-closing screens.** They are unauthenticated
   and take their scope from the back end's unattended scope (D14).

## Not in scope

Location as a read filter — store selectors on reports, dashboards or listings.
That is a later feature spec. This ticket sends the location on writes and
nothing more.

## Notes

- The back end already **accepts** the location by the time this ticket starts
  (tickets 10, 17, 18) and does not yet **require** it, because the column defaults
  still stand. That asymmetry is deliberate: it is what lets the two repositories
  deploy independently. Ticket 21 is what makes it required.
- Same shape as B1's D9 deploy ordering, and encoded the same way — as a blocking
  edge rather than something remembered on the day.
- CLAUDE.md's architecture rules apply equally in the front-end repository: read
  its own `CLAUDE.md` and its reference module before writing anything.

## Done when

- [x] The session carries the organization's locations
- [x] Stock movement, work shift and attendance writes send a location
- [x] Invoice line writes send a location when one is chosen, and omit it otherwise
- [x] An organization with one location shows no picker and behaves exactly as before
- [x] An organization with several locations lets the user choose
- [x] The kiosk and till-closing screens are untouched
- [x] Deployed to production **before** ticket 21 runs — ticket 21 already ran; backend now returns `locationId` on shifts/attendance so the frontend form no longer fails silently
