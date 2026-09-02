# Spec E — Location credentials

> Status: ready-for-agent
> Última atualização: 2026-09-02
> Architecture reference: `docs/MULTI_TENANCY_SAAS_DESIGN.md` (§2.5, §5.1)
> ADRs: `docs/adr/0002` (location is first-class), `docs/adr/0007` (app-level
> scoping is the boundary), `docs/adr/0009` (location is a caller-supplied
> write input — amended by this spec), plus `0010` written by this spec
> Deferred from: `.scratch/tenant-identity/` (spec B1) and
> `.scratch/scoped-access/` (spec B2), both under the name "device identity";
> renamed here — see Problem Statement
> Escrito em inglês, seguindo o documento de arquitetura.

---

## Problem Statement

Spec B2 replaced an invisible column default with `UNATTENDED_SCOPE` — one
named file — for every request path that has no user: the kiosk, till-closing,
the kitchen display (KDS), the AirMenu webhook and stream, and both crons.
That made the paths findable. It did not give any of them an identity.

Three of those paths are physical screens an employee stands in front of, and
none of them can currently prove which organization or location they belong
to:

- **The kitchen display has no authentication at all.** Every KDS route —
  advance an order, cancel it, the live status stream — accepts any request
  from anyone who can reach the URL.
- **Till-closing's submit endpoint claims one factor and doesn't enforce it.**
  `verify-pin` checks a PIN; `submit` accepts a bare `employeeId` from the
  client and trusts it, with no rate limit on either call. Clock-in, by
  contrast, requires both a PIN and a daily rotating token, rate-limited per
  IP.
- **Kiosk correctly authenticates an employee, but not the screen.** The PIN
  and daily token identify *who* is clocking in; they say nothing about
  *which organization's* kiosk they typed it into. That still comes from
  `UNATTENDED_SCOPE`.

None of this matters while `UNATTENDED_SCOPE` can only mean one organization.
It stops being safe at the second: every kiosk, till screen and kitchen
display in existence — org A's and org B's alike — would resolve to the same
hardcoded organization and location. Org B's employee could clock in against
org A's roster; org B's kitchen would run org A's orders. This is why both B1
and B2 name this as one of the standing gates before a second `organizations`
row is provisioned.

**Two things that share `UNATTENDED_SCOPE` today are deliberately not this
spec's problem.** The crons act as the platform, not as a screen with no way
to name its own scope — giving them a real per-organization identity is a
different mechanism (a credential to fan out, not a screen to pair) and is
already named as spec C's job. The AirMenu webhook's problem is a broken
signature check — an absent signature is currently accepted as valid — which
is a narrow fix to an existing mechanism, not a missing identity concept; it
does not need a design.

**The name "device identity" is what both prior specs called this gap, and
it's imprecise.** Nothing here needs to tell one physical screen apart from
another — a manager legitimately running both the kiosk and the till from the
same tablet is a normal case, not an edge case. What's actually missing is
proof of which **Location** a screen belongs to. This spec is named for what
it builds.

## Solution

**A screen stops trusting a shared constant and starts trusting a credential
scoped to one Location.**

A new module, `location-credentials`, owns the whole mechanism: an org admin
generates a short-lived, single-use pairing code for a Location; an unpaired
screen redeems that code exactly once for a persistent, opaque token; every
request from that screen afterward carries the token; a new `requireDeviceAuth`
middleware validates it and resolves the same organization/location shape the
rest of the codebase already uses. Revoking one screen means deleting its
token — no rotation of anyone else's.

Kiosk, till-closing and KDS keep every line of their own domain logic. They
stop importing `UNATTENDED_SCOPE` and start depending on the new middleware —
exactly the relationship they already have with `requireAuth` or the
scoped-query helper, not a rewrite of what they do.

A token authorizes a **Location**, not a feature: the same token that pairs
the kitchen display is equally valid on the kiosk and till-closing endpoints,
because there is one front-end application and no reason to force one
physical tablet through three separate pairings. This is a deliberate
simplification, not an oversight (D8).

Rollout follows the same expand-and-contract shape B1 and B2 both used: the
middleware accepts a token if present and falls back to `UNATTENDED_SCOPE` if
not, so Angrybox's live screens keep working unpaired while they're paired by
hand; a closing increment then makes the token mandatory and deletes the
fallback for these three consumers specifically. `UNATTENDED_SCOPE` itself is
untouched — it still serves the crons until spec C retires it for them.

Because this spec opens till-closing's controller anyway, it also closes the
two gaps B2 recorded there and declined to fix: `submit` gains a per-location
rate limit, and `submit` re-verifies the PIN itself instead of trusting
whatever `employeeId` the client sends.

### What this spec deliberately is not

- **It is not spec C.** Crons are out of scope; they remain
  `UNATTENDED_SCOPE`'s problem until spec C fans them out per organization.
- **It is not a webhook fix.** The AirMenu webhook's signature check is a
  separate, narrower piece of work, tracked independently.
- **It does not introduce a Device entity.** A Location has zero or more
  valid tokens; there is no row identifying a physical screen beyond that.
- **It is not feature-scoped authorization.** A token is not restricted to
  one of kiosk, till-closing or KDS — see D8 for why.

## User Stories

1. As an org admin, I want to generate a pairing code for one of my
   organization's locations, so that I can bring a new kiosk, till screen or
   kitchen display online.
2. As an org admin, I want the pairing code to expire quickly, so that a code
   I generate and forget about cannot be redeemed by someone else later.
3. As an org admin, I want a pairing code to be usable exactly once, so that
   sharing it accidentally with a second screen doesn't silently pair a
   screen I didn't intend to authorize.
4. As an employee setting up a new kiosk tablet, I want to enter the pairing
   code once and have the screen remember its credential afterward, so that
   I never have to repeat the setup for that screen.
5. As an employee, I want the kiosk, till-closing and kitchen-display pages
   on the same tablet to all work after one pairing, so that multi-tenancy
   doesn't force me to set up the same physical screen three times.
6. As an org admin, I want to see which screens are currently paired to a
   location, so that I know what's actually deployed on my floor.
7. As an org admin, I want to revoke one paired screen's credential without
   affecting any other screen at the same location, so that a lost or stolen
   tablet doesn't force me to re-pair everything else.
8. As an org admin, I want a revoked screen to stop working immediately, so
   that revocation is a real security action and not a suggestion.
9. As an org admin of organization A, I want my kiosk, till and kitchen
   display to be unable to resolve to organization B's data no matter what
   constant used to be hardcoded, so that a second organization existing at
   all doesn't put my data at risk.
10. As an org admin, I want a token paired to one of my locations to be
    useless against another organization's screens, so that a leaked token
    only ever exposes my own business.
11. As an employee at the kiosk, I want clocking in and out to keep requiring
    the PIN and daily token exactly as before, so that this change is
    invisible to me on the floor.
12. As an employee closing the till, I want the closing flow to keep working
    as it does today, except that submitting now actually checks my PIN
    instead of silently trusting whatever the screen sends.
13. As an employee closing the till, I want repeated submit attempts from the
    same screen to be rate-limited, so that a compromised or malfunctioning
    screen can't hammer the closing endpoint the way clock-in is already
    protected against.
14. As a kitchen employee, I want the kitchen display to require the screen
    to be a paired, known device before it shows or changes any order, so
    that a stranger who finds the URL cannot see or cancel my kitchen's
    orders.
15. As a kitchen employee, I want the live order stream to keep updating in
    real time after this change, so that the screen doesn't have to be
    reloaded to see new orders.
16. As a developer, I want the credential to be an opaque, random value
    rather than a signed token, so that revoking one screen is a database
    delete rather than waiting out an expiry or maintaining a blocklist.
17. As a developer, I want the credential stored hashed rather than in plain
    text, so that a database read alone can't be turned into a working
    credential.
18. As a developer, I want a table missing an organization or location scope
    on this new entity to be impossible by construction, so that this new
    module doesn't reopen the exact hole spec B2 closed elsewhere.
19. As a developer, I want the new module to depend on the `locations`
    module's existing output port to confirm a location belongs to the
    calling organization before minting a pairing code, so that "which
    organization" isn't re-implemented a second time.
20. As a developer, I want kiosk, till-closing and KDS to depend on a
    middleware rather than importing the credential-validation logic
    directly, so that the dependency shape matches how every other
    cross-cutting concern in this codebase is consumed.
21. As a developer, I want the pairing/credential concern to live in its own
    module rather than inside `locations`, `cash-closings`, `kds` or HR, so
    that no single consumer module ends up owning a dependency the other two
    also need.
22. As a developer, I want the `requireDeviceAuth` middleware to populate a
    request-scoped value shaped like the existing auth middleware's output,
    so that downstream code reads organization and location the same way
    regardless of whether the caller is a user or a paired screen.
23. As a developer, I want the SSE stream route's exception — the token as a
    query parameter instead of a header — to be documented as a deliberate,
    narrow exception, so that a future reader doesn't mistake it for an
    inconsistency to "fix."
24. As a developer, I want Angrybox's live kiosk, till and KDS screens to keep
    working, unpaired, throughout the rollout, so that shipping this spec is
    not itself an outage.
25. As a developer, I want a closing increment that makes the token mandatory
    and deletes the `UNATTENDED_SCOPE` fallback for these three consumers, so
    that the transition state doesn't become permanent by default.
26. As a developer, I want the front-end pairing UI (the admin's
    code-generation screen and the unpaired screen's redemption form) to be a
    blocking increment in this spec's own plan, so that the mandatory cutover
    can't ship before any screen is actually capable of pairing.
27. As a developer, I want `submit`'s PIN re-verification to reuse the
    existing `verify-pin` use case rather than duplicate its logic, so that
    there is exactly one place that knows how a PIN is checked.
28. As a developer, I want the location-credentials module's domain and
    use-case logic tested with fakes and no database, so that its filtering
    and issuance behaviour is pinned the same way every other module's is.
29. As a developer, I want the new token repository adapter to have an
    integration test, consistent with this repo's normal rule for adapters,
    without standing up a new kind of test harness for this module alone.
30. As a developer, I want a written pairing-and-revocation smoke test against
    the local stack, so that the end-to-end claim is reproducible by whoever
    reads it next.
31. As a developer, I want ADR-0009 amended rather than silently
    contradicted, so that a future reader isn't left holding an ADR that
    names this spec as future work after this spec has already landed.
32. As a future maintainer, I want the deferred register updated to reflect
    that "device identity" is now two separate, named pieces of work — this
    spec and spec C — so that provisioning organization number two is
    measured against the real remaining gate, not a single vague line item.
33. As a future maintainer, I want the module's README to record why a
    Device entity does not exist, so that a future request to "add
    per-device names" is answered by a design decision rather than
    rediscovered from scratch.
34. As an org admin, I want generating a new pairing code for a location that
    already has paired screens to not disturb those screens, so that
    onboarding one more tablet doesn't risk the ones already running.
35. As a developer, I want a request carrying no token and a request carrying
    a token for the wrong location to fail the same way — rejected — so that
    the failure mode doesn't leak which case it was.

## Implementation Decisions

### D1 — This spec is one of two successors to "device identity," split by consumer

The deferred register's "device identity" item covered five things sharing
`UNATTENDED_SCOPE`: kiosk, till-closing, KDS, the AirMenu webhook/stream, and
both crons. It is split by what kind of caller each one is.

- **This spec** covers the three physical, employee-facing screens — kiosk,
  till-closing, KDS — which share one identity mechanism because none of them
  can be told their own scope any other way.
- **Spec C** ("per-organization credentials; crons fan out per organization")
  covers the crons, which act as the platform and can legitimately be issued
  a per-organization credential directly, with no screen and no pairing
  involved.

One spec covering both was rejected: a cron's identity problem ("which
organization does this scheduled run belong to") and a screen's identity
problem ("which location is this physical tablet paired to") have nothing in
common mechanically, and conflating them would force cron fan-out decisions
into what is otherwise a pairing-and-credential design.

### D2 — The AirMenu webhook is excluded and treated as a separate fix

The webhook's actual defect is that its HMAC signature check accepts a
request with no signature header at all — it only rejects a signature
**mismatch**. That is a bug in an existing mechanism, not a missing identity
concept: the webhook already has a notion of "which integration is calling,"
it just doesn't enforce it correctly. Folding it into this spec's pairing
model was rejected because a third-party server calling in is not a screen an
employee stands in front of, and forcing it through the same pairing flow
would model an inbound integration credential as if it were a physical
device.

### D3 — Renamed to "Location credentials"; no Device entity is modeled

The credential this spec builds proves "this caller is paired to Location X"
and nothing about which physical screen it is. Calling this "device identity"
invites building a Device entity that this design has no use for. Renamed
accordingly; `CONTEXT.md` records **Location Token** and **Pairing Code**,
and explicitly lists "Device" as a term to avoid.

### D4 — Authorization is per-Location; pairing is per screen

A screen's token authorizes exactly one Location. Multiple screens at the
same Location each pair independently and each hold their own token, all
authorizing the same scope — there is no single shared secret typed into
every screen at a location, and no separate table naming which physical
screen a token belongs to.

**A single shared token per Location, manually copied to every screen there,
was rejected.** Losing one screen would mean rotating and redistributing the
shared secret to every other screen at that location — exactly the
operational cost that per-screen pairing exists to avoid, and it reintroduces
manual secret-copying, which the pairing flow (D6) was chosen specifically to
avoid.

### D5 — Tokens are opaque and DB-backed, not self-contained

A token is a random value, stored hashed, in a new table keyed by
organization and location, validated by lookup on every request.

**A self-contained signed token (HMAC or JWT), matching the existing daily
kiosk-token pattern, was rejected.** It cannot be revoked before it expires
without adding a blocklist — and a blocklist is itself a DB-backed revocation
mechanism, just applied to the exception path instead of the normal one.
Given individual revocability is a requirement (D4), the DB-backed lookup is
the simpler design, not an added cost: every other authenticated route in
this codebase already pays one indexed lookup per request for its own
membership/role check, so this is not a new category of cost.

### D6 — Pairing codes are issued by an org admin, short-lived, single-use

An authenticated caller with role `admin` or above generates a pairing code
for a specific Location. The code is short (human-enterable on an unpaired
screen), expires within minutes, and is burned on first use whether it
succeeds or the screen never completes the exchange.

**A longer-lived, reusable code was rejected** as the default: it widens the
window in which a leaked code pairs a screen nobody intended, for a
convenience (provisioning several screens without regenerating a code each
time) that a short loop of "generate, redeem, repeat" already covers cheaply.

### D7 — Transport is a custom header; the SSE stream is a documented exception

A new `requireDeviceAuth` middleware validates the token and populates a
request-scoped value shaped like `requireAuth`'s output. The token travels as
a custom header (e.g. `X-Device-Token`) on ordinary requests.

**Extending `requireAuth` to accept either a user JWT or a device token was
rejected.** A device token carries no role and no user, and doesn't expire
the way a session token does — collapsing two callers with different
lifecycles into one code path trades a small amount of duplication for a
permanently ambiguous shape.

**KDS's `GET /kds/stream` is a Server-Sent Events endpoint.** Browsers'
native `EventSource` cannot set custom headers, so this one route takes the
token as a query parameter instead. **Replacing `EventSource` with a
fetch-based stream reader to keep transport uniform was rejected** — it
reimplements reconnection semantics that `EventSource` already provides, for
the sake of uniformity on a single route, and this is a back-end spec
touching a front-end implementation detail. The query-parameter exception is
narrow, named, and documented rather than silently inconsistent.

### D8 — A token is not restricted to one feature

The same token that pairs a kitchen display is equally valid on the kiosk and
till-closing endpoints. Nothing about the token names which of the three it
was paired "for."

**Feature-scoped tokens were rejected.** There is one front-end application
with no per-device build (carried over from B2's D14), so a single physical
tablet legitimately running more than one of these screens is a normal case,
not a rare one — feature-scoping would force it to pair once per feature it
uses, reintroducing exactly the friction per-screen pairing (D4) was chosen
to avoid. The marginal security benefit is small: KDS has no money-affecting
action to protect against a stray token, and kiosk/till already have their
own PIN layer as the actual gate on sensitive actions.

### D9 — KDS requires the token alone; no PIN or employee factor is added

Today KDS has zero authentication. Requiring a valid Location token closes
that gap completely. **Adding a PIN layer, matching kiosk/till, was
rejected** as scope beyond the actual defect: KDS is a status board with no
"which employee did this" concern the way a cash closing or a clock-in event
has, so a second factor would protect against a threat this endpoint doesn't
have.

### D10 — Till-closing's two recorded gaps are fixed in this increment

Since this spec opens `cash-closing.controller.ts` regardless, it also closes
the two gaps B2 recorded and declined to fix:

- `submit` gains a per-location rate limit, mirroring the pattern already
  used for clock-in.
- `submit` calls the existing `verify-pin` use case itself instead of
  trusting a client-supplied `employeeId`, so there is exactly one place that
  decides whether a PIN is valid.

**Deferring these again was rejected.** The file is being opened for the
device-token change regardless, and leaving a known, already-documented hole
in a file already under edit costs more in the next reader's confusion than
fixing it now costs in review surface.

### D11 — A new module, not folded into `locations` or any consumer module

`location-credentials` is a new hexagonal module. It depends on `locations`'
existing output port to confirm a location belongs to the calling
organization when minting a pairing code; kiosk (HR), cash-closings and KDS
each depend on its middleware, unchanged otherwise.

**Folding this into `locations` was rejected.** `locations` is deliberately
minimal by its own recorded design decision — a single read, no writes, no
cross-module middleware role, answering to a business caller ("give me my
org's stores"). This concern answers to a different kind of caller (an
unattended screen proving its own scope) and would erase that documented
minimalism for the sake of avoiding one more module boundary.
**Folding it into one of the three consumer modules was rejected** for the
same reason spec B2's helper wasn't folded into any one domain module: the
concern is genuinely shared, and no consumer should own a dependency the
other two also need.

### D12 — Rollout is expand-and-contract, with an explicit closing increment

The middleware accepts a token if present and falls back to
`UNATTENDED_SCOPE` if absent. Angrybox's live screens are paired by hand
during that window with no outage. A closing increment then makes the token
mandatory and deletes the fallback for kiosk, till-closing and KDS
specifically. `UNATTENDED_SCOPE` is not deleted by this spec — it remains the
crons' mechanism until spec C retires it for them.

This is the same shape B1 and B2 both used for their own cutovers, chosen for
the same reason: a half-migrated system stays fully working throughout, and
the closing increment is what prevents the transition state from becoming
permanent by default.

### D13 — The front-end pairing UI is a blocking increment, not a footnote

The admin's pairing-code-generation screen and the unpaired screen's
redemption form are both required before the closing increment (D12) can
ship. **Treating the front end as a separately-tracked, undated dependency
was rejected** — B2's own D13/ticket 19 already established why: shipping the
mandatory cutover before any screen is capable of pairing turns the migration
into an outage.

### D14 — New ADR for the module; ADR-0009 is amended, not superseded

**ADR-0010** records the location-credentials module: per-Location tokens,
the pairing flow, and the expand-and-contract rollout (D4–D7, D12).
**ADR-0009 is amended** to note that D14's unattended-scope mechanism is
superseded for kiosk, till-closing and KDS specifically — not for the crons,
which continue using it until spec C. Amending rather than superseding
matches the discipline B2 itself used on ADR-0007: the original decision
stands, only the parts this spec changes are flagged.

### D15 — Testing stays fakes-only, consistent with B1/B2's declined harness

Domain and use-case tests (pairing-code issuance, redemption, revocation,
token validation) run against fakes, no database. The new token repository
adapter gets an integration test — this repo's normal rule for adapters,
applied here as everywhere else, not a new exception.

**A dedicated Supabase integration harness was rejected**, breaking with
B1/B2's precedent only for a reason that doesn't hold up: the new entity is
security-sensitive but otherwise an ordinary CRUD table, and the real
end-to-end claim — a paired screen can act, a revoked one cannot — is
covered by the smoke test (D16 in Testing Decisions below), not by a
database-backed unit suite.

## Testing Decisions

### What makes a good test here

Same standard as B1 and B2: a good test pins external behaviour and uses
fakes for output ports, never a real database or network. The auth
middleware tests B1 added are the direct prior art for the new
`requireDeviceAuth` middleware: construct it with hand-written fakes,
exercise it, assert on what it populates and what it rejects.

### Seams

Two existing seams inherit this change; one new seam is added.

1. **`location-credentials` (new seam, unit + one adapter test).** Pairing-
   code issuance, redemption, revocation, and token validation are tested
   against fakes. The token repository adapter gets an integration test per
   this repo's normal rule for adapters. `requireDeviceAuth` gets its own
   middleware test, built the same way the auth middleware's tests are.
2. **`cash-closings`' existing use-case seam (extended).** `submit-closing`'s
   test gains cases for the rate limit and for calling `verify-pin` instead
   of trusting a bare `employeeId`. `verify-pin`'s existing test remains the
   seam for the PIN-checking logic itself.
3. **Kiosk and KDS (unchanged, mechanically threaded).** Neither had a
   controller-level test before this spec and neither gains one now — the
   middleware swap replaces `UNATTENDED_SCOPE` with the new middleware's
   output at the call site, which is a mechanical dependency change, not new
   logic to pin.
4. **Pairing-and-revocation smoke (written up).** Against the local stack,
   in the manner of B1's token-hook verification and B2's two-organization
   smoke.

### Cases that must be covered

At the `location-credentials` seam:

- a pairing code redeemed once succeeds and mints a token scoped to the
  correct organization and location;
- a pairing code redeemed a second time fails;
- an expired pairing code fails;
- `requireDeviceAuth` accepts a valid token and populates the expected scope;
- `requireDeviceAuth` rejects a missing token, an unknown token, and a
  revoked token, indistinguishably from one another;
- revoking one token does not affect any other token for the same location.

At the `cash-closings` seam:

- `submit-closing` rejects a PIN that doesn't match the given `employeeId`,
  where previously it would have accepted any `employeeId`;
- repeated submissions from the same location past the rate limit are
  rejected.

At the smoke level:

- a screen pairs, then successfully calls each of the three endpoint groups
  (kiosk, till-closing, KDS) with the same token;
- the same token is rejected by a different organization's equivalent
  endpoints;
- revoking the token causes all three endpoint groups to reject it
  immediately;
- the KDS stream's query-parameter token behaves identically to the header
  form used elsewhere;
- Angrybox's existing, unpaired screens keep working throughout, until the
  closing increment is reached.

## Out of Scope

Everything here is recorded with a trigger, either below or in the deferred
register.

- **Spec C** — per-organization credentials and cron fan-out. Crons keep
  using `UNATTENDED_SCOPE` until spec C retires it for them.
- **The AirMenu webhook's signature check.** A separate, narrower fix,
  tracked independently of this spec.
- **A Device entity**, or any per-physical-device attribution beyond a list
  of active tokens with issue dates.
- **Feature-scoped tokens.** Rejected in D8.
- **The other "before org #2" gated items** carried over unchanged from spec
  A/B2's deferred register: the remaining 65 composite foreign keys,
  composite indexes, CRM text primary keys, object-storage path prefixing,
  seed template data at provisioning.
- **Multi-organization login and organization switching.** Inherited
  unchanged from B1's deferred register.

## Further Notes

### Deferred register update

The "device identity" row in B1's and B2's deferred registers is retired and
replaced by two precise rows:

| Deferred | Why it can wait | Trigger |
|---|---|---|
| This spec: location credentials for kiosk, till-closing, KDS | With one organization every screen already belongs to it | before org #2 |
| Spec C: per-organization credentials, cron fan-out | Same reasoning, for the crons specifically | immediately after this spec |

**A possible side effect worth flagging, not claimed as resolved:** B2's D14
scoped the kiosk PIN lookup to `UNATTENDED_SCOPE`'s organization "correct by
construction while one organization exists, and superseded by device
identity later." Once kiosk resolves its organization from a real paired
token instead of a hardcoded constant, the PIN lookup scopes to whichever
organization actually paired that screen — which may fully address the
separately-deferred "kiosk PIN collision across organizations" item, since a
lookup properly filtered by the screen's real organization wouldn't return a
different organization's employee even on a matching PIN. This is not
verified against the current query implementation in this session; whoever
picks up this spec should confirm it before deciding whether that deferred
item can be closed alongside this one or still needs its own fix.

### Cross-repository contract

CLAUDE.md requires the two repositories to stay in contract sync within the
same task. This spec changes the contract in several places, all additive:

- a new admin-facing endpoint to generate a pairing code for a location;
- a new admin-facing endpoint to list and revoke a location's active tokens;
- a new unpaired-screen endpoint to redeem a pairing code for a token;
- kiosk, till-closing and KDS requests now carry a device-token header (query
  parameter for the KDS stream specifically);
- till-closing's `submit` payload is unchanged, but a submission with a PIN
  mismatch now fails where it previously succeeded.

**Deploy order.** The back end ships the fallback-tolerant middleware first
(D12) — existing screens keep working unpaired. The front end then ships the
pairing UI (D13). Only after real screens are paired does the closing
increment make the token mandatory. Reversing this makes the closing
increment an outage on every kiosk, till and KDS screen in production — the
same shape as B1's D9 and B2's own cross-repository note.

### Risks

| Risk | Mitigation |
|---|---|
| The closing increment ships before the front end can pair a screen, breaking every live screen | D13 makes the front end a blocking increment, same as B2's ticket 19 |
| Revoking one screen accidentally revokes others at the same location | D4's per-screen tokens make revocation a single-row delete, not a shared-secret rotation |
| The `UNATTENDED_SCOPE` fallback is never removed | D12's closing increment exists solely to remove it for these three consumers |
| ADR-0009 is left stating this spec as future work after it has already landed | D14's amendment, done as part of this spec, not after |

### Increments

| # | Title | Blocked by |
|---|---|---|
| 01 | Foundation: `location-credentials` module — pairing codes, tokens, revocation, `requireDeviceAuth` middleware, fallback to `UNATTENDED_SCOPE` | — |
| 02 | Convert kiosk to `requireDeviceAuth` (fallback active) | 01 |
| 03 | Convert till-closing to `requireDeviceAuth`; fix the rate-limit and PIN-reverification gaps | 01 |
| 04 | Convert KDS to `requireDeviceAuth`, including the SSE stream's query-parameter form | 01 |
| 05 | Front end: admin pairing-code UI, unpaired-screen redemption form | 02, 03, 04 |
| 06 | Closing: make the token mandatory, remove the `UNATTENDED_SCOPE` fallback for these three consumers; write ADR-0010; amend ADR-0009; pairing-and-revocation smoke | 05 |
