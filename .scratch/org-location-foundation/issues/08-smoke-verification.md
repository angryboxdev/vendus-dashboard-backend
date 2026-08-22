# 08 — Smoke verification

Status: open
Blocked by: 04, 06, 07
Spec: `../spec.md` (D11, "Done means")

## Problem

Spec A's headline criterion is "the app behaves identically", and **nothing
automated can check it**.

All 136 test files live under `src/modules/**/__tests__` and use fakes for the
output ports — none constructs a Supabase client, so none touches a schema.
`src/services/` (39 files: HR, CRM, stock, DRE, analytics) and `src/routes/`
have zero tests. `createClient` is called without a `<Database>` type parameter,
so `tsc` sees `.from("anything")` as valid.

**Green CI after this spec means nothing.** That is not a reason to skip CI — it
is a reason to write this checklist down and actually run it.

## Work

Run the app against the local stack (issues 01–02) with the full migration set
applied. For each area: one read and one write, checking the response matches
what the same call returned before the change.

Modules (have unit tests, none of which touch the DB):

- [ ] `cash-closings` — list, submit a closing, approve it
- [ ] `invoices` — list, create, classify a line, reconcile
- [ ] `payable-entries` — list, create
- [ ] `payable-recurrences` — list contracts, generate an occurrence
- [ ] `bank-statements` — import a statement, match a movement, link an entity
- [ ] `bank-accounts` — list banks, create a bank, create an account
- [ ] `financial-base` — cost centers, suppliers, **and the PDF header (issue 04)**
- [ ] `vendus` — summary, KPIs, analytics cache write
- [ ] `air-menu`, `kds`, `tasks`, `financial-obligations` — main endpoints

Legacy services (**zero tests — the real risk surface**):

- [ ] HR: employees, shifts, attendance, leave, payments, documents, audit log
- [ ] HR kiosk: daily token, scan check-in, scan check-out
- [ ] CRM: customers, contacts, tags, orders, scripts, parameters
- [ ] Stock: items, categories, movements, preparations, the quantities RPC
- [ ] Pizzas: pizzas, prices, recipes, recipe items
- [ ] DRE: receita bruta, custos fixos, custos variáveis, KPIs
- [ ] Supplier invoice import: upload, parse, map an article, adjust stock
- [ ] Vendus mapping

Jobs:

- [ ] `cron:daily-vendus-consumption` — runs end to end
- [ ] `stock:adjust-from-lines` — runs end to end

## Then

- [ ] `supabase db diff --linked` reports no drift
- [ ] `supabase db push --dry-run` lists **only** the spec A migrations — anything from `_archive/` is a stop signal
- [ ] `supabase db push`
- [ ] Re-run the module smoke checks against staging

## Done when

- [ ] Every box above is ticked, by someone who ran it rather than reasoned about it
- [ ] Anything that broke is fixed and re-verified
