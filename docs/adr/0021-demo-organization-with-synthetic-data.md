# Test mode is a separate demo organization with synthetic data

Decided by the user on 2026-10-11: the new HR needs two "modes" — a test mode
full of fictitious employees and companies, and the real mode with the real
Angry Box employees. Implemented as **two organizations**, not as a flag on
records: a demo organization with synthetic data next to the real one, with a
visible selector.

Why an organization and not a flag: isolation already exists per
organization (ADR-0020), so demo data can never leak into real reports,
exports or payroll; and the GDPR rule "only synthetic data in test" (task
§4.3) is satisfied structurally.

## Rules

- The demo organization only ever holds data from `npm run demo:generate`
  (module `demo-data`): deterministic, every record `synthetic: true`, emails
  `@demo.invalid`, no NIF/NISS/IBAN/address.
- The real organization is never seeded with synthetic data, and real data is
  never copied into the demo one.
- Legal parameters in demo seeds carry `a_validar = true` (task §4.5).
- Real employee data in the new HR model only with DPO approval for go-live
  (task §4.3).

## Consequences

- Until the second-organization gate is closed (ADR-0020), the demo
  organization exists only in local and staging. In production, "Novo RH"
  first runs against the real organization only, with no synthetic data.
- The loader into the demo organization is written when the new HR tables
  exist (Phase 1+); in Phase 0 the generator writes a local JSON file.
