# 05 — Phase 2c: composite FKs — HR & banking domain

**What to build:** A write naming another organization's HR employee, work
shift, bank account, bank, bank movement, or bank statement import is
rejected by the database, not by application code. Add `FOREIGN KEY
(org_id, <col>) REFERENCES <target> (org_id, id)` for every reference into
`hr_employees`, `hr_work_shifts`, `bank_accounts`, `banks`,
`bank_movements`, and `bank_statement_imports` (12 references), built
online: `NOT VALID` first, `VALIDATE CONSTRAINT` after. `bank_movements`
has carried real production data since day one — check its size before
validating.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** ready-for-agent

- [ ] All 12 references into `hr_employees`, `hr_work_shifts`,
      `bank_accounts`, `banks`, `bank_movements`, `bank_statement_imports`
      have `NOT VALID` composite FKs, then successfully
      `VALIDATE CONSTRAINT`ed
- [ ] `supabase db reset` rebuilds the schema from the repository
- [ ] `bank_movements`' size checked before validating; lock duration
      confirmed acceptable
- [ ] Smoke check per target table: own-organization write succeeds;
      sibling-organization write rejected with a named foreign-key-violation
      error
- [ ] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP
