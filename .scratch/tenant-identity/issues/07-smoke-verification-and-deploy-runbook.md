# 07 — Smoke verification and the deploy-order runbook

Status: ready-for-agent
Blocked by: 06
Spec: `../spec.md` (D9, Testing Decisions)

## Problem

Two gaps, both of which this spec would otherwise ship with.

**Nothing automated can tell you this worked.** All test files use fakes for the
output ports, none constructs a database client, and the client is untyped, so a
misspelled table name compiles. Green CI is not evidence that a migration is
correct — it is evidence that nothing else moved. Restated from spec A's D11
because it still holds and is still the easiest mistake to make.

**The deploy order is only in a spec nobody will be reading at deploy time.**
Running the migration before the front end ships logs every user out. That is
the one failure mode of this spec that users would notice, and right now it
survives only as prose in D9.

## Work

### Smoke, by hand, against the local stack

Run the app against a full `supabase db reset` with every migration and seed
applied, driving real HTTP round trips with a real GoTrue-issued JWT — the
method spec A's issue 08 established. Not the Supabase client directly.

- [x] An existing Angrybox user signs in and their session resolves, with the
      organization present
- [x] The user listing returns only that organization's members
- [x] Creating, re-roling and removing a user behave as D8 describes, including
      removal deleting the account only on the last membership
- [x] An operation naming a real user outside the caller's organization is
      refused as not found
- [x] The provisioning script produces a usable second organization, and its
      admin signs in — the only way to exercise the multi-organization paths at
      all, since production has one
- [x] With two organizations live: neither admin's user listing shows the
      other's members, and neither can re-role or remove across the boundary
- [x] A user given a membership in **both** organizations is refused at login,
      distinguishably from a bad password, in the response and in the logs
- [x] An HR viewer's restricted access behaves exactly as it did before

Record the findings in this file under `## Comments`, as a deliverable.

### The runbook

Write D9's deploy order down where whoever ships this will read it, with the
reason attached — an order without its reason gets "optimised" by the next
person:

1. **Front end ships first**, reading the new claims and falling back to the old
   one. Harmless while the old claim is still what arrives.
2. **The migration runs.** Tokens now carry `org_id` and `org_role`; the
   tolerant reader already understands them.
3. **The back end ships**, reading the organization from the new claim.
4. **The fallback is removed** in a later release.

Only step 1 must precede step 2. Also record the failure signature of a missing
`supabase_auth_admin` grant on `org_members`: the hook silently injects nothing
and it presents as every user being locked out.

## Not in scope

The Supabase-backed integration harness. Spec A's D11 placed it in the isolation
work "where the scoped query helper creates the seam to test against" — that is
B2, and building it before the helper exists means building it against nothing.

## Done when

- [x] Every smoke box above is checked, with findings recorded in this file
- [x] The deploy-order runbook exists outside `.scratch/`, with its reasons
      (`docs/DEPLOY_TENANT_IDENTITY.md`)
- [x] The deferred register's organization #2 gate is discoverable from the
      runbook — production must not get a second organization yet
