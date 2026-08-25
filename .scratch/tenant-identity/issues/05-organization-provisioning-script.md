# 05 — Organization provisioning script

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D7)

## Problem

There is no way to create an organization, and deliberately there will be no
endpoint for it. An endpoint that creates organizations must be authorized by
something, and that something becomes a permanent privileged concept in the
running application. Worse, such a request is legitimately *unscoped* — so B2's
scoped query helper would need an escape hatch and the raw-query lint would need
an exception. §2.6 already observes that escape hatches get reused. Keeping
provisioning outside the request path lets the rule governing 406 call sites
stay absolute, because the exception is not in the same building.

There is also a practical reason this ticket exists now rather than later: a
second organization on the local stack is the **only** way to exercise any
multi-organization path at all. Production has one.

## Work

A script, run from `package.json` like the other operational jobs, that in one
run creates:

1. the `organizations` row (`name`, `nif`, optional `address` and `email` — `nif`
   is unique and is the organization boundary per §2.3),
2. its first `locations` row,
3. the first auth user, and
4. that user's **admin** membership in the new organization.

A new customer must be usable the moment it finishes.

## Not in scope

**Seed template data.** The channel list §3.2 calls an org template, cost centre
groups and categories, stock categories, public holidays — none of it. The
script creates the organization, its location and its first admin, and stops.
Angrybox is already seeded; the need appears with the first real new customer,
and it is in the deferred register with that trigger.

## Notes

- **The operator has no bypass.** Access to a customer's organization is an
  ordinary membership row like anyone else's — visible, revocable, and present
  in whatever audit trail exists. There is no platform-administrator concept
  anywhere in the codebase, and this script must not create one. What this does
  not buy is any protection against a leaked service role key, which grants
  everything either way; the gain is architectural and is claimed as no more
  than that.
- **Exactly one membership per user.** D5 locks a two-organization person out of
  both, so the script must never be the thing that produces one.
- **Make the gate visible.** No second `organizations` row may exist in
  production until the deferred register's first four items land — device
  identity for the user-less paths, the org-claim RLS policies and storage path
  prefixing, the composite keys and indexes, and seed template data. This script
  is the natural place for that gate to be stated where someone will read it
  before running it, rather than remembered.

## Done when

- [ ] One command creates an organization, its first location, its first auth
      user and that user's admin membership
- [ ] The created admin can sign in against the local stack and their token
      carries the new organization and the `admin` role
- [ ] Exactly one membership row is created per run
- [ ] The script refuses a duplicate `nif` rather than producing a second
      organization for the same legal entity
- [ ] The organization #2 gate and its four blocking items are stated where the
      operator running the script will see them
- [ ] No seed template data is created
