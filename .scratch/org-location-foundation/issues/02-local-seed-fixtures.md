# 02 — Local seed fixtures

Status: open
Blocked by: 01
Spec: `../spec.md` (D11, Risks)

## Problem

`supabase db reset` gives an empty database. Every reset would otherwise mean
re-entering data by hand before anything can be smoke-tested — which makes reset
expensive, which means it stops being used, which is how the schema drifted in
the first place.

Restoring a production dump is not the answer: migrations `028` and `032`
deliberately locked salary and employee data behind the service role, and that
data should not land on a laptop.

## Work

Write synthetic fixtures that `supabase db reset` runs automatically. The CLI
executes `supabase/seed.sql` after migrations on every reset; newer versions
accept `[db.seed] sql_paths` in `config.toml`, so split by area rather than
writing one large file:

- org + location (one organization, one location — mirrors Angrybox in shape, not in data)
- financial base (cost centers, suppliers, banks, bank accounts)
- HR (a handful of employees, shifts, leave — invented names, invented NIFs/IBANs)
- stock (categories, items, movements, preparations)
- CRM (customers, tags, scripts, parameters)
- invoices + payable entries

Enough rows that every list endpoint returns something and every join has
coverage. Not enough to be a performance test.

## Notes

- Keep these clearly separate from the existing `supabase/seed_*.sql`, which are
  hand-run production data fixes and are **not** local fixtures.
- If a realistic-volume backfill test is ever needed, restore a production dump
  with the `hr_*` and `crm_*` tables scrubbed — as a deliberate one-off, not as
  the default local workflow.

## Done when

- [ ] `supabase db reset` produces a database the app runs against with no manual steps
- [ ] Every module's main list endpoint returns non-empty data against it
- [ ] No real employee, customer or supplier data appears in any fixture
