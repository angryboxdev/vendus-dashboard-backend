# 02 — Convert kiosk to `requireDeviceAuth`

**What to build:** The kiosk route stops importing `UNATTENDED_SCOPE` directly and
resolves its organization/location scope from `requireDeviceAuth` instead (fallback
to `UNATTENDED_SCOPE` still active per ticket 01 — unpaired screens keep working).
Clock-in and clock-out keep requiring exactly what they require today: a PIN and the
daily rotating token, rate-limited per IP. Nothing about that flow changes — only
where the org/location scope comes from.

This is a mechanical dependency swap at the call site, not new domain logic — no new
controller-level test is expected, matching how kiosk had none before this spec.

Also verify, and record the answer, on the deferred "kiosk PIN collision across
organizations" item: today the kiosk PIN lookup is scoped to `UNATTENDED_SCOPE`'s
organization only because that's "correct by construction while one organization
exists." Once the org/location comes from a real paired token, confirm whether the
PIN lookup — now filtered by the screen's actual paired organization — already
prevents a PIN match against a different organization's employee. If it does, note
that the separately-tracked deferred item can be closed alongside this ticket; if it
doesn't (e.g. the query still needs an explicit scope filter added), fix it here,
since the file is already open for this exact reason.

**Blocked by:** 01

**Status:** done, verified

- [x] Kiosk resolves organization/location via `requireDeviceAuth`, not a direct
      `UNATTENDED_SCOPE` import.
- [x] Clock-in/out still require PIN + daily token, still rate-limited per IP,
      unchanged from today's behavior.
- [x] A paired screen's kiosk requests resolve to the paired location; an unpaired
      screen's requests still resolve to `UNATTENDED_SCOPE` (fallback path from
      ticket 01).
- [x] The kiosk PIN-collision deferred item is explicitly checked against the real
      query implementation; the outcome (fixed here, or confirmed already safe once
      scope comes from a real token) is recorded — in this ticket file's Comments, or
      wherever the deferred register itself gets updated.

## Comments

`src/routes/hrKioskRoutes.ts`'s `POST /kiosk/scan` no longer imports
`UNATTENDED_SCOPE`. It now runs `requireDeviceAuth`
(`src/middleware/device-auth.ts`) as route middleware — after the existing
per-IP rate limit, which was pulled out into its own `rateLimitScan`
middleware so both compose on the router rather than nesting a manual
`next()` call inside the handler — and reads `req.deviceAuth!.organizationId`
/ `.locationId` instead of the constant. An unpaired screen carries no
`X-Device-Token` header, so `requireDeviceAuth`'s existing fallback (ticket
01) still populates `req.deviceAuth` from `UNATTENDED_SCOPE` — unpaired kiosk
behavior is unchanged. PIN + daily-token validation and the 20 req/min/IP
rate limit are untouched, both value and order (rate limit still runs first).
`GET /kiosk/daily-token` needs no scope and was left as-is.

**PIN-collision deferred item — closed, no query change needed.** Traced the
call chain: `hrKioskRoutes.ts` → `kioskScan(organizationId, locationId, …)`
→ `findActiveEmployeeByPinHash(organizationId, pinHash)`
(`src/services/hrEmployeeService.ts`), which already builds its query via
`createScopedQuery(organizationId)` — that helper
(`src/infra/scoped-db/scoped-query.ts`) unconditionally appends the
organization-column `.eq(...)` filter before any caller-added predicate,
including the `kiosk_pin_hash` lookup. So the PIN lookup was already
organization-scoped by whatever `organizationId` reached it; the only thing
that was wrong was the *source* of that id (a hardcoded constant instead of
the screen's real paired organization). Now that `requireDeviceAuth` supplies
the real organization, a PIN collision across two organizations' employees
is prevented by construction — org B's rows never reach the `kiosk_pin_hash`
predicate when the scope is org A. Recorded as closed in
`.scratch/scoped-access/spec.md`'s deferred register (the "Kiosk PIN
collision across organizations" row).

**Verification:** `npm run typecheck`, `npm run lint:deps`, and the full
`npm test` (153 suites / 1299 tests) all pass. No new controller-level test
was added, matching the ticket's note that kiosk had none before this spec
and this is a mechanical call-site swap, not new domain logic.
