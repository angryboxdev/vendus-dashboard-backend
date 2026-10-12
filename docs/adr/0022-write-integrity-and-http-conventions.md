# HTTP conventions for new endpoints: RFC 7807, Idempotency-Key, ETag/If-Match, correlation id

Task RH (phased), Phase 0 (§4.2 "Integridade das escritas"). Shared code in
`src/infra/http/`; proven by TK-2 (`src/infra/http/__tests__/tk-02-write-integrity.test.ts`).

Decided:

- **Errors:** `application/problem+json` (`type`, `title`, `status`,
  `detail`, `instance`, `correlationId`, extension members). The body also
  keeps `error` (= detail) because the current frontend reads `body.error`.
  `problemHandler` is the last middleware in `server.ts`, so any unhandled
  error now returns a generic 500 problem instead of Express's HTML page, and
  the internal message only goes to the log.
- **Idempotency-Key:** required on every write of the new HR endpoints.
  Same key + same caller + same body → stored response replayed with
  `Idempotent-Replayed: true`; same key, other body → 422; still running →
  409; 5xx not stored. Store: in memory in Phase 0 (one Render instance);
  a persistent table comes with the first HR write endpoints (Phase 1),
  because a restart loses the keys.
- **Optimistic concurrency:** reads return `ETag` (derived from the record
  version); writes require `If-Match` → 428 if missing, 412 if stale.
- **Correlation id:** `X-Correlation-Id` accepted (safe format) or generated,
  returned on every response, included in problems and logs.
- **Logs:** `log(level, event, fields)` writes one JSON line and redacts
  personal fields (name, NIF/NISS, IBAN, email, phone, address, health,
  location, PIN, tokens).

Legacy endpoints are **not** migrated in bulk: they keep their current error
shape until each one is touched.

## CI

`.github/workflows/ci.yml` (both repositories) runs on pull requests and on
`main`: typecheck, unit tests, boundary lint (backend), secret scan
(gitleaks) — all blocking — plus dependency audit and SAST (Semgrep), which
start as **report-only** because the legacy code has never been scanned;
they become blocking once the baseline is triaged. TK-1 also needs a GitHub
admin to mark the CI job as a required check on `main` (branch protection);
that setting is not in the repository.

## Migrations

Supabase migrations are forward-only. Every new migration of the new HR
ships with its rollback script in `docs/migrations/rollback/<same-name>.sql`,
and destructive changes (drop/rename/data rewrite) need a written rollback
plan before merge (task §4.6.7). Audit tables are never deleted.

## Consequences

The OpenAPI document for the new HR lives in `docs/openapi/novo-rh.yaml` and
grows with each endpoint; it already defines the shared headers and the
problem schema.
