# Spec B1 — Tenant identity

> Status: ready-for-agent
> Última atualização: 2026-08-24
> Architecture reference: `docs/MULTI_TENANCY_SAAS_DESIGN.md` (§2.5, §2.6, §6 items 3 and 4)
> ADRs: `docs/adr/0003` (roles are org-scoped), `docs/adr/0007` (app-level scoping is the boundary)
> Predecessor: `.scratch/org-location-foundation/` (spec A, merged)
> Escrito em inglês, seguindo o documento de arquitetura.

---

## Problem Statement

Spec A gave the database a tenant root: `organizations` and `locations` exist and
hold the Angrybox rows, and every table carries `org_id`. But nothing in the
running application knows which organization a request belongs to. Identity still
resolves through a single `DEFAULT_ORG_ID` constant in the composition root, and
`org_id` reaches the database only through column defaults that silently stamp
every write with Angrybox.

Three things follow from that, and each becomes a live problem the day a second
customer is onboarded:

- **A role is still a global property of a person.** `app_users.role` says what
  someone is, everywhere, forever. There is no way to express "manager at
  Angrybox, nothing at customer #2" — which is the ordinary case as soon as more
  than one organization exists, and the reason ADR-0003 exists.
- **User administration is unscoped.** Listing and creating users reads and
  writes the whole `app_users` table with the service role. On the day org #2
  exists, an admin at one restaurant can enumerate and modify the accounts of
  another. This is the single most dangerous endpoint in the codebase.
- **There is nowhere to put an `orgId`.** Spec B2 has to thread an organization
  through 132 use cases, but the value does not exist in the request path at all.
  Until it does, the scoped query helper has no argument to be built from.

Spec A's own gate makes this urgent rather than theoretical: **no second
`organizations` row may be created until the deferred work lands**, and the work
in this spec is the part everything else waits on.

## Solution

Every authenticated request carries a **verified organization**, and every role is
held **within** one.

A membership table replaces the global user role: `org_members` records that a
person holds a role *in* an organization. The Supabase access-token hook reads it
and injects the organization and the role held there into the JWT, so the
organization arrives as a signature-verified claim rather than as something the
client asserts. The auth middleware exposes it as `orgId` on the request's auth
payload, alongside the role.

One endpoint group consumes it immediately: user administration becomes
organization-scoped, so an admin manages the users of their own organization and
cannot see any other. That is both a required fix and this spec's end-to-end
proof — the role that invoice PDFs played in spec A, where the smallest honest
demonstration that the tenant root is real was to make one user-visible artifact
read from it.

Nothing else consumes `orgId` yet. Threading it through the domain is spec B2.

### What this spec deliberately is not

It is not isolation. At the end of B1 a user of org A can still read org B's
data, because no repository filters by organization yet. B1 builds the carrier;
B2 makes it load-bearing. Splitting them is deliberate: the combined work spans
132 use cases, 59 out-adapters, 38 legacy service files and 124 endpoints, with
no reviewable stopping point in the middle, and the dependency between the halves
is strict — the helper cannot be built before an `orgId` exists to build it from.

## User Stories

1. As an organization admin, I want to log in and have the system know which
   organization I belong to, so that everything I do is attributed to it without
   my having to select it.
2. As an organization admin, I want to list the users of my organization, so that
   I can see who has access to my data.
3. As an organization admin, I want to be certain the user list shows *only* my
   organization's users, so that another customer's staff are not visible to me
   and mine are not visible to them.
4. As an organization admin, I want to create a user inside my organization, so
   that a new employee can sign in.
5. As an organization admin, I want a user I create to receive a role that
   applies only within my organization, so that granting access here grants
   nothing anywhere else.
6. As an organization admin, I want to change a user's role in my organization,
   so that I can promote or restrict them as their job changes.
7. As an organization admin, I want to remove a user from my organization, so
   that a departing employee immediately loses access.
8. As an organization admin, I want removing a user from my organization not to
   affect their access to any other organization they belong to, so that
   revocation is scoped to my contract.
9. As an organization admin, I want to be unable to see, modify or delete a user
   who is not a member of my organization even if I know their identifier, so
   that guessing an id is not an attack.
10. As a manager, I want my role to be the one I hold in this organization, so
    that permissions reflect my job here rather than a global label.
11. As an HR viewer, I want my restricted access to continue to behave exactly as
    it does today, so that this change is invisible to me.
12. As any signed-in user, I want my session to keep working across the change,
    so that a migration to multi-tenancy is not an outage.
13. As a person who belongs to no organization, I want to be refused access
    rather than silently given some default organization's data, so that a
    half-provisioned account cannot see someone else's business.
14. As a person who somehow belongs to two organizations, I want to be refused
    access with a clear, distinguishable error rather than have the system pick
    one for me, so that no request is ever answered against a guessed tenant.
15. As a support engineer, I want that refusal to be identifiable in logs and in
    the API response, so that "cannot log in" is diagnosable in one step instead
    of being mistaken for a broken password.
16. As the operator of the product, I want to provision a new organization from a
    script, so that onboarding a customer does not require an endpoint that can
    create organizations.
17. As the operator of the product, I want that script to create the
    organization, its first location, its first admin user and that user's
    membership in one run, so that a new customer is usable immediately after it
    finishes.
18. As the operator of the product, I want my own access to a customer's data to
    be an ordinary membership row, so that it is visible, revocable and
    auditable rather than an ambient privilege.
19. As the operator of the product, I want no code path anywhere that bypasses
    organization scoping, so that spec B2's guarantee has no exception to carve
    out.
20. As a developer, I want the organization to arrive as a verified JWT claim
    rather than a client-supplied header, so that a new endpoint cannot forget to
    validate it.
21. As a developer, I want `orgId` available on the request's auth payload, so
    that spec B2 has a value to thread into use case inputs.
22. As a developer, I want the auth middleware to be unit-testable with fakes, so
    that the membership rules are covered by tests rather than by reading the
    code.
23. As a developer, I want a test that proves a user with zero memberships is
    refused, so that the fail-closed behaviour cannot silently regress.
24. As a developer, I want a test that proves a user with two memberships is
    refused, so that the system never guesses a tenant.
25. As a developer, I want a test that proves a user with exactly one membership
    receives both the organization and the role held in it, so that the happy
    path is pinned.
26. As a developer, I want the token hook exercised directly against the local
    stack, so that a plpgsql change is verified rather than assumed.
27. As a developer, I want the front end to accept both the old and the new claim
    shape for one release, so that the two repositories do not have to deploy in
    the same second.
28. As a developer, I want the deploy order written down, so that running the
    migration before the front end ships does not log every user out.
29. As a developer reading the code in a year, I want one place that answers
    "which organization is this request", so that the answer is not reconstructed
    from three mechanisms.
30. As a developer, I want the deferred work recorded with its trigger condition,
    so that "before organization #2" is a checklist rather than a memory.
31. As a future maintainer, I want `app_users` gone rather than left holding a
    stale role, so that there is exactly one source of truth for what a person
    may do.

## Implementation Decisions

### D1 — Spec B splits into B1 (identity) and B2 (scoped access)

`docs/MULTI_TENANCY_SAAS_DESIGN.md` §5.1 defines spec B as phases 2, 4 and 5
together. Measured against the codebase that is 132 use case input DTOs, 59
out-adapters, 12 controllers, 16 route files, 124 endpoints and 38 legacy service
files holding 192 of the 406 `.from(` call sites — plus the membership rework,
the token hook, the role taxonomy and dropping the column defaults.

That fails §5.1's own test, that a spec should be a unit of *verification*. It
also contains a strict internal dependency: the scoped query helper cannot be
built before an `orgId` exists in the request path. The split follows the
dependency rather than inventing a seam.

- **B1 (this spec):** every request and job carries a verified organization.
- **B2 (next):** the scoped query helper, every adapter and service behind it,
  `orgId` threaded through use case inputs, the `org_id` / `location_id` column
  defaults dropped, and dependency-cruiser wired into CI.

B1 ships with no isolation benefit of its own, in the same way spec A shipped a
tenant root nothing read. Accepted for the same reason.

### D2 — App-level scoping is the tenant boundary; RLS is deferred

Settles open decision 3. Recorded as ADR-0007; the full reasoning lives there and
is summarized here only as it bears on B1.

This is a thick-backend system, not a Supabase-native one: the front end imports
Supabase in three files, all for authentication, and issues zero queries. The
browser never meets the database, which is the condition that makes RLS
mandatory in a BaaS architecture.

Two facts made RLS-as-the-boundary a poor fit now. The service role **bypasses
policies entirely**, so §2.6's "RLS as backstop" described a net that does not
exist — a real net requires changing what the application authenticates as, not
merely adding policies. And several route groups have no user at all, so
policies keyed on the authenticated user would need a privileged second path for,
among others, the cash-closing submit.

The eventual net is therefore the **org-claim** variant: the backend
authenticates as a non-privileged role declaring which organization it is acting
for, and policies compare `org_id` against that claim. It works with no
logged-in user and compares an indexed column to a constant instead of running a
correlated subquery. It is additive and deferred behind the organization #2 gate.

**Consequence carried into B2, not B1:** the deferral is only cheap if the helper
becomes the sole database construction site. That is B2's done-criteria, not
this spec's.

### D3 — One active organization, carried in a verified claim

The membership model is many-to-many in the schema from day one, because a table
is cheap to make plural now and painful later. Three real cases exist: a
Portuguese bookkeeper serving several restaurants, one owner holding two NIFs
(§2.3 makes those two organizations), and the operator supporting a customer.

But the **token carries exactly one organization**, and v1 refuses ambiguity
rather than resolving it. The alternative — listing memberships in the token and
naming the organization per request in a header — moves tenant identity into
client-supplied data on every one of 124 endpoints, where it is only as safe as
the validation code on the newest one. A claim is verified once, in one place.

This does not constrain the future RLS design: under D2 the backend mints its own
token for the database, so the Supabase token's shape is independent of it.

Org switching (an active-organization preference, a switch endpoint, a session
refresh, a switcher in the UI) is additive and deferred — see the register below.

### D4 — `app_users` is dropped; `org_members` is the only membership record

```
org_members
  org_id      uuid  not null  → organizations(id)
  user_id     uuid  not null  → auth.users(id) on delete cascade
  role        text  not null  check (role in ('admin','manager','hr_viewer'))
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()
  primary key (org_id, user_id)
```

`app_users` mirrored `auth.users` and carried the global `role`. With roles
org-scoped, the mirror holds nothing that `auth.users` does not, so it is
removed rather than left as a profile table with one useful column.

**This drops the `org_id` column spec A added to `app_users`.** Spec A's
inventory said the "every table" rule had one exemption and `app_users` was not
it. That was right at the time and is wrong now: a single `org_id` on a user
cannot express a many-to-many membership. The column is dropped with the table.

The cost, stated plainly: PostgREST cannot join into the `auth` schema, so
listing an organization's users with their email addresses becomes a membership
query plus the auth admin user listing, joined in memory. That listing is
paginated; a restaurant has on the order of ten users, so a single page is the
realistic case and the code must still handle more than one.

`auth.users` is foreign-key referenceable from the public schema — the dropped
`app_users` primary key already did exactly that — so the cascade is real
deletion behaviour, not an application convention.

### D5 — The token hook injects an organization only when membership is unambiguous

The Supabase access-token hook currently reads the global role and injects a
single claim. It is rewritten to read `org_members` and inject **both** the
organization and the role held in it.

The rule is: **exactly one membership, or no claims at all.** Zero memberships
and two memberships are treated identically — the token carries nothing, the
middleware finds no organization, and the request is refused. Fail-closed, one
rule, and the system never answers a request against a guessed tenant.

The hook runs as the auth admin, so it requires an explicit read grant on the new
table. Without that grant it fails silently by injecting nothing, which presents
as every user being locked out — called out here because it is the most likely
way this issue is misdiagnosed.

Accepted cost: a person who ends up in two organizations is locked out of both.
The refusal must therefore be distinguishable in the response and in logs from an
ordinary authentication failure, or it will be debugged twice. It is also hard to
reach by accident — two different organizations' admins would each have to add
the same person — and the provisioning script creates exactly one membership.

### D6 — The role taxonomy is carried over unchanged

ADR-0003 decided roles are org-scoped and explicitly left the taxonomy open,
noting `admin | manager | hr_viewer` was already flagged as not great. It stays
exactly as it is here. Only the scoping changes.

What the current model actually is, for the record: a three-level ladder where
almost every route requires the middle level. The top level gates only user
administration and one kiosk endpoint; the bottom level sits *below* the middle
one, so it means "HR reads and nothing else" rather than naming a capability.

Its real limitation is that a ladder cannot express "sees HR but not the bank
account", which is the first thing a second customer is likely to ask for, since
salary and banking are precisely what owners do not hand out. Fixing that is a
separate spec, deferred until a real customer's needs are known rather than
guessed. Changing one variable at a time also keeps this spec reviewable.

### D7 — The operator's access is an ordinary membership; creating an
organization is a script, not an endpoint

There is **no platform-administrator bypass anywhere in the codebase.** Access to
a customer's organization is a membership row like anyone else's — visible,
revocable, and present in whatever audit trail exists.

The reasoning is not primarily about attack surface. An endpoint that creates
organizations must be authorized by something, and that something becomes a
permanent privileged concept in the running application. More decisively, such a
request is legitimately *unscoped*, so the B2 helper would need an escape hatch
and the raw-query lint would need an exception. §2.6 already observes that escape
hatches get reused. Keeping provisioning outside the request path lets the rule
governing 406 call sites stay absolute, because the exception is not in the same
building.

What this does not buy: any protection against a leaked service role key, which
grants everything either way. The gain is architectural, and is claimed as no
more than that.

The provisioning script creates the organization row, its first location, the
first auth user, and that user's admin membership. Seed template data — the
channel list that §3.2 calls an org template, cost centre groups and categories,
stock categories, public holidays — is **not** in this spec; see the register.

Self-serve signup is not foreclosed. If it ever matters it returns as part of a
provisioning and billing surface (phase 11) with its own authorization story, not
as an administrative endpoint on the tenant API.

### D8 — User administration becomes organization-scoped, and is this spec's proof

Spec A's D10 argued that a tenant root nothing reads is inert data whose only
acceptance criterion is "it exists", and made invoice PDFs read the organization
row as the smallest honest end-to-end proof. B1 has the same exposure: an `orgId`
populated and consumed by nobody.

User administration is the natural consumer, and not a contrived one — it is
unscoped today and becomes the most dangerous endpoint in the product the moment
a second organization exists. Scoping it is required work that doubles as the
demonstration that the claim is real.

Behaviour after this spec:

| Operation | Behaviour |
|---|---|
| List users | Members of the caller's organization only |
| Create user | Creates the account and a membership in the caller's organization |
| Change role | Only for a member of the caller's organization |
| Remove user | Removes the membership in the caller's organization; deletes the account only when it was that person's last membership |
| Any operation on a non-member | Behaves as not found, whether or not the identifier is real |

**Response and request shapes do not change.** The listing still returns
identifier, email, role and timestamps; creation still takes email, password and
role. This keeps the administration screen in the front end untouched.

The removal rule is the one genuinely new decision: with one organization it is
observationally identical to today's behaviour, and with several it makes
revocation scoped to the contract that granted it.

### D9 — The claims are renamed, and the front end ships first as a tolerant reader

The claim carrying the role is renamed to say what it now means — a role held in
an organization — and an organization claim is added beside it. Leaving the old
name in place would have been a smaller change, but it would have meant a claim
whose name asserts a global fact while holding an org-scoped one, for an
open-ended period.

The hook is a database migration, so the claim shape changes the instant it runs,
independently of any application deploy. The front end reads the role claim
directly out of the token to build its session, so a naive ordering logs every
user out until the front end catches up.

**Deploy order, and the reason for it:**

1. Front end ships first, reading the new claim and falling back to the old one.
   Harmless while the old claim is still what arrives.
2. The migration runs. Tokens now carry the new claims; the tolerant reader
   already understands them.
3. The backend ships, reading the organization from the new claim.
4. The fallback is removed in a later release.

Only step 1 must precede step 2. Getting that wrong is the single failure mode of
this spec that users would notice.

Front end changes: the session user gains an organization identifier, the role
type is renamed to reflect org scoping while keeping its three values, and claim
parsing accepts either shape. The administration screen and the navigation
role check are untouched, because D8 keeps the API shapes stable.

### D10 — One new code seam: the auth middleware becomes constructible with fakes

The middleware today verifies a token against a remote key set and, when the
claim is absent, falls back to a database lookup — both real I/O, reached through
module-level singletons, which is why it has no tests.

It becomes a factory taking its token verification and its membership lookup as
injected collaborators, matching the constructor-injection idiom the hexagonal
modules already use. The claim-to-auth-payload decision — including the
zero/one/two membership rule — is then a unit test with fakes and no network.

The membership fallback is kept, not dropped: it exists so that a
misconfigured hook degrades to a database lookup rather than to a total lockout,
and that property is more valuable after this spec than before it, since the hook
now carries two claims instead of one. It reads `org_members` and applies the
same unambiguity rule.

This is the only new seam introduced. Everything else is verified through
existing means.

### D11 — The auth payload carries `orgId`, and nothing else reads it yet

The request auth payload gains the organization identifier alongside the subject,
email and role. Apart from user administration (D8), nothing consumes it in this
spec. That is the intended end state of B1: the carrier exists and is proven, and
B2 makes it load-bearing.

## Testing Decisions

### What makes a good test here

A good test in this repository pins **external behaviour** — what a caller
observes — and uses fakes for output ports rather than reaching a database or the
network. The prior art is the reference module's use case tests: construct the
unit with a fake collaborator, exercise it, assert on the returned value. Tests
that assert on how a value was obtained, rather than what was returned, are
what this repo already avoids and this spec does not introduce.

There is an important caveat inherited from spec A's D11, and it still holds:
**the existing suite structurally cannot detect schema breakage.** Every test
file uses fakes; none constructs a database client; the client is untyped, so a
misspelled table name compiles. Green CI is not evidence that a migration is
correct. It is evidence that nothing else moved.

### Seams

Three levels, and deliberately only one new seam:

1. **The auth middleware factory (new seam, unit tests).** The
   claim-to-auth-payload decision with fakes for token verification and
   membership lookup. This is where the rules that matter live, and it is
   currently untested.
2. **The token hook (existing seam, SQL against the local stack).** The hook is
   plpgsql and cannot be reached from the unit suite. It is exercised by calling
   the function directly with a synthetic event and asserting on the returned
   claims. The prior art is spec A's RLS work, which verified catalog state and
   real client behaviour against the local stack and wrote the findings down as a
   deliverable rather than automating them into the Jest run.
3. **User administration and login (smoke).** Verified by hand against the local
   stack. Pulling an HTTP testing library in to cover four handlers would add a
   second new seam for less value than the two above; the endpoints are thin and
   their risk is concentrated in the organization filter, which is visible in
   review.

Deliberately **not** built here: the Supabase-backed integration harness. Spec
A's D11 placed it in the isolation work "where the scoped query helper creates
the seam to test against" — that is B2, and building it before the helper exists
means building it against nothing.

### Cases that must be covered

At the middleware seam:

- exactly one membership yields an auth payload carrying both the organization
  and the role held in it;
- zero memberships yields no auth payload, and therefore a refusal;
- two memberships yields no auth payload, and therefore a refusal;
- a token with the organization claim present is trusted without a database
  lookup;
- a token without the claim falls back to the membership lookup and applies the
  same unambiguity rule;
- an invalid or absent token yields no auth payload.

At the hook seam:

- a user with one membership receives both claims, with the role being the one
  held in that organization;
- a user with no memberships receives neither claim;
- a user with two memberships receives neither claim;
- the same person holding different roles in two organizations is covered by the
  case above, and is the reason it exists.

At the smoke level:

- an existing Angrybox user signs in and their session resolves, with the
  organization present;
- the user listing returns only that organization's members;
- creating, re-roling and removing a user behave as D8 describes;
- an operation naming a user outside the caller's organization is refused;
- the provisioning script produces a usable second organization on the local
  stack — which is also the only way to exercise the multi-organization paths at
  all, since production has one.

## Out of Scope

- **Isolation itself.** No repository filters by organization at the end of this
  spec. A user of org A can still read org B's data. That is spec B2.
- **The scoped query helper**, and moving any adapter or service behind it.
- **Threading `orgId` into use case inputs, controllers or DTOs.**
- **Dropping the `org_id` / `location_id` column defaults.** They remain the
  scaffold keeping existing writes working; removing them is B2's proof.
- **Row Level Security policies keyed on the organization**, and the credential
  change that would make them run. Deferred per D2 and ADR-0007.
- **The role taxonomy.** Carried over unchanged per D6.
- **Every path with no user** — kiosk, kitchen display, delivery-aggregator
  webhook and its event stream, the internal cron endpoints and the standalone
  jobs. They continue to resolve through the existing constant. See the register.
- **Org switching and multi-organization login.** The schema permits it; the
  runtime refuses it. See the register.
- **Seed template data for a new organization.** The provisioning script creates
  the organization, its location and its first admin, and stops there.
- **Billing, plans, subdomains, white-label branding.** Phase 11.

## Further Notes

### Deferred register

Nothing below is lost work; each item has a trigger rather than a vague "later".
The first four share spec A's gate: **no second `organizations` row until they
land.**

| Deferred | Why it can wait | Trigger |
|---|---|---|
| Device identity for the user-less paths — kiosk, kitchen display, aggregator webhook and stream, cron organization | With one organization every device already belongs to it. Two of these paths have no authentication at all today, so this is also a pre-existing hole, currently contained | before org #2 |
| Org-claim RLS policies and the credential change; storage path prefixing (spec A item 6) | Additive per D2; policies are per-table so they can be tightened one at a time | before org #2 |
| Composite foreign keys, composite indexes, the CRM text primary keys (spec A items 1, 2, 4) | Cross-organization divergence is impossible while one organization exists | before org #2 |
| Seed template data at provisioning — channels, cost centre groups and categories, stock categories, public holidays | Angrybox is already seeded; the need appears with the first new organization | before org #2 |
| Multi-organization login and org switching — an active-organization preference, a switch endpoint, a session refresh, a switcher in the UI | The schema is already many-to-many, so this is additive. D5 refuses ambiguity in the meantime rather than mis-answering it | first genuinely multi-organization person, which a second organization does *not* by itself imply |
| Role taxonomy rework, including renaming the role values and whatever claim carries them | Orthogonal to scoping, per ADR-0003 | when a second customer's access needs are known |

### Corrections to the architecture document

Two things in `docs/MULTI_TENANCY_SAAS_DESIGN.md` are wrong as written and are
corrected as part of this spec:

- **§5.1, spec C.** Its criterion includes deleting the `DEFAULT_ORG_ID`
  constant. It cannot: the user-less paths deferred above are its last consumer,
  so the device identity spec deletes it. Spec C narrows to removing the global
  integration credential and fanning crons out per organization.
- **§2.6, point 1.** It relies on dependency-cruiser to ban raw queries outside
  the scoped helper. As configured, dependency-cruiser is not a gate at all:
  there is no package script and no CI workflow, and it runs only from an agent
  hook scoped to a single module directory. It never sees the legacy service
  layer, where 192 of the 406 query call sites live. Wiring it up over the whole
  source tree is a B2 done-criterion.

### Why the front end is touched at all

CLAUDE.md requires the two repositories to stay in contract sync within the same
task. This spec keeps every HTTP shape identical (D8), so the only cross-repo
change is the token claim rename (D9) — and it is a breaking one, because the
front end reads the token directly rather than through the API. The tolerant
reader exists specifically so that the two deploys need not be simultaneous.

### Issues

| # | Title | Blocked by |
|---|---|---|
| 01 | `org_members` table; drop `app_users`; grants for the token hook | — |
| 02 | Token hook injects organization and org-scoped role; SQL verification of 0/1/2 memberships | 01 |
| 03 | Auth payload gains `orgId`; middleware becomes injectable; membership fallback; unit tests | 02 |
| 04 | User administration becomes organization-scoped | 03 |
| 05 | Organization provisioning script | 01 |
| 06 | Front end: tolerant claim reader, org-scoped role type, organization on the session user | — (ships first) |
| 07 | Smoke verification and the deploy-order runbook | 04, 05, 06 |

### Risks

| Risk | Mitigation |
|---|---|
| The migration runs before the front end ships, and every user appears logged out | D9's deploy order; the tolerant reader is step 1 and is harmless when deployed early |
| The token hook loses its read grant on the new table and silently injects nothing, presenting as a total lockout | Called out in D5; covered by the hook's SQL verification, which fails loudly if the grant is missing |
| A person ends up in two organizations and is locked out of both | D5 accepts this; the refusal must be distinguishable in the response and logs, and the provisioning script creates exactly one membership |
| Green CI is mistaken for evidence that the migration is correct | Restated from spec A's D11 in Testing Decisions; the hook and the schema are verified against the local stack, not by the unit suite |
| `orgId` is populated but consumed by nothing, so the spec proves nothing | D8 gives it one real consumer, chosen because it is required work rather than a demonstration |
| The deferred register is forgotten, and organization #2 is provisioned against an unguarded system | The first four items carry spec A's existing hard gate; the provisioning script is the natural place to make that gate visible |
