# 03 — Auth payload gains `orgId`; the middleware becomes constructible with fakes

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D10, D11), ADR-0003

## Problem

Spec B2 has to thread an organization through 132 use cases, and the value does
not exist in the request path at all. Until it does, the scoped query helper has
no argument to be built from.

The middleware that would carry it has no tests, and structurally cannot: it
verifies a token against a remote key set and falls back to a database lookup —
both real I/O, reached through module-level singletons. The rules that matter
most in this spec (zero, one, two memberships) would land in the one file
nothing covers.

## Work

1. **`AuthPayload` gains `orgId`**, alongside the subject, email and role. The
   role field is renamed to reflect org scoping; its three values are unchanged.
2. **The middleware becomes a factory** taking its token verification and its
   membership lookup as injected collaborators, matching the
   constructor-injection idiom the hexagonal modules already use. The
   claim-to-payload decision then becomes a unit test with fakes and no network.
3. **Keep the membership fallback, pointed at `org_members`.** It exists so a
   misconfigured hook degrades to a database lookup rather than to a total
   lockout — a property worth *more* after this spec than before it, since the
   hook now carries two claims instead of one. It applies the same unambiguity
   rule as the hook: exactly one membership, or no auth payload.
4. **Make the refusal distinguishable.** A user with zero or two memberships is
   refused, and that refusal must be identifiable in the response and in logs,
   separately from an ordinary authentication failure. Otherwise "cannot log in"
   gets debugged as a broken password.
5. Unit tests with fakes for both collaborators.

## Not in scope

Nothing consumes `orgId` yet except user administration (ticket 04). No
repository filters by organization at the end of this spec — a user of org A can
still read org B's data. That is B2. This ticket builds the carrier.

## Notes

- This is the **only** new seam the spec introduces (D10). Everything else is
  verified through existing means. Resist adding a second one.
- The fallback moving from `app_users` to `org_members` is what removes the
  middleware as a reader of `app_users`; ticket 06 drops the table once the last
  reader (ticket 04) is gone too.

## Done when

- [ ] `req.auth` carries `orgId` on every authenticated request
- [ ] The middleware is constructible with fakes for token verification and
      membership lookup, with no network or database reached in its unit tests
- [ ] Exactly one membership yields a payload carrying both the organization and
      the role held in it
- [ ] Zero memberships yields no payload, and therefore a refusal
- [ ] Two memberships yields no payload, and therefore a refusal
- [ ] A token carrying the `org_id` claim is trusted without a database lookup
- [ ] A token without the claim falls back to the membership lookup and applies
      the same unambiguity rule
- [ ] An invalid or absent token yields no payload
- [ ] The zero/two-membership refusal is distinguishable from an authentication
      failure in both the response and the logs
- [ ] No back-end code reads `app_users` for the role any more
