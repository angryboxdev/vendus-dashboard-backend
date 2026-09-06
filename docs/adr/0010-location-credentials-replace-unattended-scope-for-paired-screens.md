# Location credentials replace `UNATTENDED_SCOPE` for kiosk, till-closing and KDS

Settles spec E's core mechanism (`.scratch/location-credentials/spec.md` D3-D8,
D11, D12). A new module, `location-credentials`, gives the kiosk, the
till-closing screen and the kitchen display (KDS) a real credential proving
which **Location** they belong to, replacing the single hardcoded
`UNATTENDED_SCOPE` constant those three consumers used to share (ADR-0009
D14). The crons are explicitly out of scope — see the Amendment recorded on
ADR-0009, and spec C for their own successor mechanism.

**The credential authorizes a Location, not a physical device (D3).** A
`LocationToken` proves "this caller is paired to Location X" and nothing
about which screen it is — a manager legitimately running kiosk, till and KDS
on the same tablet is the normal case, not an edge case (D8). There is
deliberately no `Device` entity: `CONTEXT.md` records **Location Token** and
**Pairing Code** as the vocabulary, and lists "Device" as a term to avoid.
Naming individual devices was rejected as building a concept this design has
no use for; a Location has zero or more valid tokens, one per paired screen,
each independently revocable.

**Authorization is per-Location; pairing is per screen (D4).** Multiple
screens at the same Location each pair independently and each hold their own
token, all authorizing the same scope. A single shared token per Location,
manually copied to every screen there, was rejected: losing one screen would
mean rotating and redistributing the shared secret to every other screen at
that location — exactly the operational cost per-screen pairing exists to
avoid.

**Tokens are opaque and DB-backed, stored hashed, not self-contained (D5).**
A token is a random value, stored as a SHA-256 hash in a new table keyed by
organization and location, validated by lookup on every request. A
self-contained signed token (HMAC or JWT), matching the existing daily
kiosk-token pattern, was rejected: it cannot be revoked before it expires
without adding a blocklist, and a blocklist is itself a DB-backed revocation
mechanism applied to the exception path instead of the normal one. Given
individual revocability is a requirement, the DB-backed lookup is the simpler
design, not an added cost — every other authenticated route in this codebase
already pays one indexed lookup per request for its own membership/role
check. Revoking a screen is a plain `DELETE` on its row, no `revoked_at`
column: a missing row and a revoked row are therefore the same thing to the
validator, which is what makes "missing/unknown/revoked all rejected
identically" true by construction rather than a rule every check has to
remember.

**The pairing flow: an org admin issues a short-lived, single-use code; an
unpaired screen redeems it exactly once for a persistent token (D6).** An
authenticated caller with role `admin` or above generates a pairing code for
a specific Location. The code is short (human-enterable on an unpaired
screen), expires within minutes, and is burned on first use whether it
succeeds or the screen never completes the exchange. A longer-lived, reusable
code was rejected as the default: it widens the window in which a leaked code
pairs a screen nobody intended, for a convenience a short "generate, redeem,
repeat" loop already covers cheaply. Once redeemed, the screen holds its
token indefinitely and sends it on every subsequent request; there is no
re-pairing step short of revocation.

**Transport is a custom header; the SSE stream is a documented exception
(D7).** A new `requireDeviceAuth` middleware validates the token and
populates a request-scoped `req.deviceAuth`, shaped like `requireAuth`'s
output for a logged-in user. The token travels as a custom header
(`X-Device-Token`) on ordinary requests. Extending `requireAuth` to accept
either a user JWT or a device token was rejected: a device token carries no
role and no user, and doesn't expire the way a session token does —
collapsing two callers with different lifecycles into one code path trades a
small amount of duplication for a permanently ambiguous shape. KDS's
`GET /kds/stream` is a Server-Sent Events endpoint; browsers' native
`EventSource` cannot set custom headers, so this one route
(`requireDeviceAuthAllowingQueryParam`) takes the token as a `device_token`
query parameter instead. Replacing `EventSource` with a fetch-based stream
reader to keep transport uniform was rejected — it reimplements
reconnection semantics `EventSource` already provides, for the sake of
uniformity on a single route. The query-parameter exception is narrow, named
and documented, not a general license to accept a token via query string
anywhere else.

**A token is not restricted to one feature (D8).** The same token that pairs
the kitchen display is equally valid on the kiosk and till-closing endpoints
— nothing on the token names which of the three it was paired "for."
Feature-scoped tokens were rejected: there is one front-end application with
no per-device build, so a single physical tablet legitimately running more
than one of these screens is the normal case, and feature-scoping would force
it to pair once per feature, reintroducing exactly the friction per-screen
pairing (D4) exists to avoid. The marginal security benefit is small — KDS
has no money-affecting action to protect, and kiosk/till already have their
own PIN layer as the actual gate on sensitive actions.

**Rollout is expand-and-contract, with an explicit closing increment
(D12).** Tickets 01 through 05 had `requireDeviceAuth` accept a token if
present and fall back to `UNATTENDED_SCOPE` if absent, so Angrybox's live
screens kept working unpaired while they were paired by hand and while the
front-end pairing UI (ticket 05) shipped. **Ticket 06 — this ADR's own
increment — deletes that fallback for kiosk, till-closing and KDS
specifically**: a request to any of the three with no valid token is now
rejected outright, with no distinguishing signal between a missing, unknown
or revoked token. `UNATTENDED_SCOPE` itself is untouched by this: it remains
the crons' mechanism, unaffected because they never go through
`requireDeviceAuth` at all — they build `UNATTENDED_SCOPE` directly
(`internalCronRoutes.ts`) — and stays that way until spec C retires it for
them. This is the same shape ADR-0007's org-claim-RLS deferral and ADR-0009's
own D14 both used for their own cutovers: a half-migrated system stays fully
working throughout, and the closing increment is what prevents the
transition state from becoming permanent by default.

**A new module, not folded into `locations` or any consumer module (D11).**
`location-credentials` depends on `locations`' existing output port
(`LocationRepositoryPort.findOneForOrganization`) to confirm a location
belongs to the calling organization when minting a pairing code; kiosk (HR),
cash-closings and KDS each depend on its middleware, unchanged otherwise.
Folding this into `locations` was rejected — `locations` is deliberately
minimal by its own recorded design decision, answering to a business caller
("give me my org's stores"), and this concern answers to a different kind of
caller (an unattended screen proving its own scope). Folding it into one of
the three consumer modules was rejected for the same reason spec B2's scoped
query helper wasn't folded into any one domain module: the concern is
genuinely shared, and no consumer should own a dependency the other two also
need.

## Consequences

Kiosk, till-closing and KDS now reject any request that cannot present a
valid, currently-paired Location token — the property spec E exists to
deliver. `UNATTENDED_SCOPE` is not deleted: it remains a live, correct
mechanism for the crons, and ADR-0009 is amended (not superseded) to record
that its D14 mechanism is superseded for these three consumers only.

The kiosk employee-PIN lookup (ADR-0009 D14) now scopes to whichever
organization actually paired the calling screen, resolved from a real token
instead of a hardcoded constant — `findActiveEmployeeByPinHash`'s existing
`createScopedQuery(organizationId)` call needed no change, only the real
scope threaded through. This closes the previously-deferred "kiosk PIN
collision across organizations" item; see the deferred register.

This decision does not cover the crons' own identity problem ("which
organization does this scheduled run belong to"), which is a different
mechanism — a credential to fan out, not a screen to pair — left to spec C.

Related: `docs/adr/0009` (the unattended-scope mechanism this decision
supersedes for kiosk/till/KDS, and its own D14), `docs/adr/0007` (the same
expand-and-contract deferral shape, applied to org-claim RLS), `docs/adr/0008`
(the scoped-query helper `location-credentials`' adapters use for every
operation that already knows its organization); `CONTEXT.md` (Location Token,
Pairing Code); `.scratch/location-credentials/spec.md` D1, D3-D8, D11, D12,
D14; `src/modules/location-credentials/README.md`.
