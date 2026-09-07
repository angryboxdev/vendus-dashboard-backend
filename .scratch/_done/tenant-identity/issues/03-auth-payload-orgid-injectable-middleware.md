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

- [x] `req.auth` carries `orgId` on every authenticated request
- [x] The middleware is constructible with fakes for token verification and
      membership lookup, with no network or database reached in its unit tests
- [x] Exactly one membership yields a payload carrying both the organization and
      the role held in it
- [x] Zero memberships yields no payload, and therefore a refusal
- [x] Two memberships yields no payload, and therefore a refusal
- [x] A token carrying the `org_id` claim is trusted without a database lookup
- [x] A token without the claim falls back to the membership lookup and applies
      the same unambiguity rule
- [x] An invalid or absent token yields no payload
- [x] The zero/two-membership refusal is distinguishable from an authentication
      failure in both the response and the logs
- [x] No back-end code reads `app_users` for the role any more
      (see Comments — true for auth/role determination; user administration in
      `authRoutes.ts` still reads/writes `app_users` for identity/CRUD, and that
      is ticket 04/06 scope, not this one)

## Comments

Implemented as a two-file split under `src/middleware/`, plus one line changed
in `src/routes/authRoutes.ts`:

**`src/middleware/auth-middleware.ts` (new, 213 lines) — the new seam (D10).**
Pure factory with zero I/O imports (only Express types):

- `AuthPayload` gains `orgId: string`; the role field is renamed `orgRole:
  AppRole` (chosen over keeping `app_role` per the ticket's own suggestion —
  mirrors the JWT's `org_role` claim from ticket 02). Three role values
  unchanged.
- `VerifiedClaims { sub, email, orgId?, role? }`, `TokenVerifier = (token) =>
  Promise<VerifiedClaims | null>`, `Membership { orgId, role }`,
  `MembershipLookup = (userId) => Promise<Membership | null>` — the lookup
  contract returns `null` for both zero and two-or-more memberships, per D5's
  unambiguity rule, collapsed deliberately into one falsy case (documented
  on the type itself so a future implementer doesn't have to rediscover it).
- `resolveAuth(token, verifyToken, lookupMembership): Promise<AuthResolution>`
  is the claim-to-payload decision, exactly as D10 describes it: no token →
  `{status:"no-auth"}`; invalid token → same; token carries both `org_id`+
  `org_role` → trusted directly, `lookupMembership` never called; token
  missing either claim → falls back to `lookupMembership`, whose `null`
  becomes `{status:"ambiguous-membership", sub}` and whose hit becomes
  `{status:"ok", payload}`.
- `createAuthMiddleware({ verifyToken, lookupMembership })` returns
  `{ populateAuth, requireAuth, requireMinRole }`. `populateAuth` sets
  `req.auth` on `"ok"`, or `req.authRefusal = "ambiguous-membership"` on that
  status (new field on `Express.Request`, alongside the existing `auth?`).
  `requireAuth` keeps the exact original 401 shape
  (`{error:"Autenticação necessária"}`) for `no-auth`, and returns a
  **distinguishable** `403` with `{error: "...", code:
  "AMBIGUOUS_ORG_MEMBERSHIP"}` plus a `console.warn` tagged
  `[auth] AMBIGUOUS_ORG_MEMBERSHIP: ...` for the ambiguous case.
  `requireMinRole` carries the same distinguishing branch for defense in
  depth (in practice `requireAuth` runs first on every route that matters,
  per `server.ts` line 93, so this is a safety net) and reads
  `req.auth.orgRole` instead of `.app_role`.

**`src/middleware/auth.ts` (rewritten, 85 lines) — composition, not seam.**
Imports `createAuthMiddleware` from `auth-middleware.ts` and wires the real
collaborators: `verifyTokenViaJwks` (the original `jose`/JWKS logic,
untouched, now producing `VerifiedClaims` with `org_id`/`org_role` read off
the token instead of `app_role`) and `lookupMembershipInDb` (the membership
fallback, D10 item 3 — queries `org_members` by `user_id`, requires exactly
one row via `data.length !== 1`, applying the same unambiguity rule the hook
applies). Exports `populateAuth`, `requireAuth`, `requireMinRole` from a
module-level `defaultAuthMiddleware` instance, so every existing consumer
(`server.ts`, `hrKioskRoutes.ts`, `cashClosingRoutes.ts`,
`cash-closing.controller.ts`, `hrRoutes.ts`, `hrAuditRoutes.ts`,
`hrLeaveRoutes.ts` — verified by grep, listed below) needed zero changes
beyond what the build already caught. Also re-exports the types
(`AppRole`, `AuthPayload`, etc.) and `resolveAuth`/`createAuthMiddleware` in
case anything imports them from `auth.js` later.

**Why two files, not one (deviation from the brief, justified).** The brief
allowed "a small number of files still under `src/middleware/`". A single
file didn't work mechanically: `jose` is ESM-only and its package build
doesn't parse under `ts-jest`'s CommonJS transform (`SyntaxError: Unexpected
token 'export'` from `node_modules/jose/dist/webapi/index.js`) — confirmed by
first writing everything into one `auth.ts` and watching the test suite fail
to even load. Splitting the pure factory into `auth-middleware.ts` (imported
by the test) from `auth.ts` (imports `jose` + Supabase, imported by nothing
in the test) resolves it cleanly and also makes the "no network, no
database" property structurally true rather than just true-by-convention —
the test file literally cannot reach `jose` or `getSupabaseServiceRole`
through its import graph.

**`src/routes/authRoutes.ts`** — one line changed, exactly as scoped: line 28,
`role: req.auth!.app_role` → `role: req.auth!.orgRole`. Nothing else in that
file touched (it still reads/writes `app_users` for user CRUD — ticket 04).

**Grep verification of consumers** (`grep -rn 'app_role\|AuthPayload' src/`
before finishing): zero remaining `.app_role` references anywhere; zero
remaining bare `AuthPayload` references outside `auth-middleware.ts`'s own
definition and `auth.ts`'s re-export. `grep -rln "middleware/auth" src/`
found exactly the seven consumer files listed above, all importing only
`populateAuth`/`requireAuth`/`requireMinRole` as functions — none read
`.app_role` or import `AuthPayload` as a type, so none needed changes.

**Tests** — `src/middleware/__tests__/auth.test.ts`, 10 cases, all against
`resolveAuth` and `createAuthMiddleware` from `auth-middleware.ts` with
hand-written fake `TokenVerifier`/`MembershipLookup` closures (no test
double library, matching the reference module's style of small
purpose-built fakes): the seven "Cases that must be covered" from the spec
plus one dedicated to the ordinary-401 shape being unchanged and one to the
response/log distinguishability. `npx jest --config jest.config.cjs
--testPathPattern=src/middleware` → 10/10 passing. `npm run build` (tsc via
`tsconfig.build.json`) → clean.

**One TS wrinkle worth flagging.** `tsconfig` has
`exactOptionalPropertyTypes: true`, so `verifyTokenViaJwks` couldn't
literally return `{ sub, email, orgId: orgId ?? undefined, role: role ??
undefined }` — an explicit `undefined` assigned to an optional property is
rejected differently from the property being absent. Built the claims object
imperatively instead (`const claims: VerifiedClaims = { sub, email}; if
(orgId) claims.orgId = orgId; if (role) claims.role = role;`) — the standard
way to satisfy that flag in this codebase's style, not a change of behaviour.

**Nothing to flag as unsatisfied.** Every "Done when" item is met; the one
caveat is the `app_users` item, called out inline above and expected per the
ticket's own Notes section ("ticket 06 drops the table once the last reader
(ticket 04) is gone too").
