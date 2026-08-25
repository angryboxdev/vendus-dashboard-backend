# Spec A — Org & location foundation

> Status: ready to start
> Última atualização: 2026-08-22
> Architecture reference: `docs/MULTI_TENANCY_SAAS_DESIGN.md` (§2, §5.1)
> Escrito em inglês, seguindo o documento de arquitetura.

---

## Why

Covered by `docs/MULTI_TENANCY_SAAS_DESIGN.md` §2. This spec carries only the
*what* and the acceptance criteria — the rationale lives there, and duplicating
it forks the two copies.

## Done means

1. `supabase db reset` rebuilds the whole schema locally from the repo, and
   `supabase db diff --linked` reports **no drift** against production.
2. `organizations` and `locations` exist and hold the Angrybox rows.
3. Every table except `organizations` has `org_id NOT NULL`.
4. The event tables carry `location_id NOT NULL`; `invoice_lines` carries a
   nullable `location_id`.
5. Invoice PDFs print the org identity read from the `organizations` row —
   `src/config/company.ts` is gone.
6. The four unprotected HR tables have RLS enabled.
7. The app behaves identically: every endpoint returns what it returned before.

## Scope

### In scope

- Baselining the schema and standing up a local Supabase stack.
- `organizations` + `locations`, seeded with Angrybox.
- The `org_id` / `location_id` schema pass, as **one migration**.
- Rewriting the unique constraints that would collide across tenants
  (with the CRM exception below).
- Replacing `src/config/company.ts`.
- The RLS audit, and closing the four HR holes it found.

### Out of scope

- **Storage org-prefixing.** A data migration over the Storage API, not DDL,
  and inherently non-atomic. Belongs with the `storage.objects` policies in
  spec B (§2.6 point 3).
- **Threading `orgId` through use cases, controllers or DTOs.** Spec B, phase 4–5.
- **RLS policies keyed on `org_id`.** Spec B. Only deny-by-default on the four
  HR tables lands here, because it needs no `org_id`.
- **The per-location stock RPC.** `get_stock_quantities_with_last_purchase`
  keeps returning org-wide totals; grouping by location comes when a second
  location exists.
- Anything in the frontend repo. This spec changes no endpoint, no request
  shape and no response shape.

### Deferred to spec B — must land before organization #2 is provisioned

These are all things that cannot bite while there is exactly one organization,
and that are cheaper or safer to do later. They are listed here so they are not
lost, and the gate is a hard one: **no second `organizations` row until every
item is done.**

| # | Item | Why deferred |
|---|---|---|
| 1 | Composite FKs `(org_id, id)` on ~52 relationships | Cross-org stitching needs two orgs. `VALIDATE CONSTRAINT` is online and guaranteed to pass while one org exists. |
| 2 | Composite `(org_id, …)` indexes | With one org the leading column has one distinct value and buys the planner nothing. `CREATE INDEX CONCURRENTLY` is online. |
| 3 | Dropping every `org_id` / `location_id` `DEFAULT` | The defaults are the scaffold that keeps the 59 write sites working until spec B threads `orgId` through. |
| 4 | The CRM text primary keys (see below) | Restructuring them *requires* composite FKs, i.e. item 1. |
| 5 | Kiosk PIN: QR payload carries a location, index becomes `(org_id, kiosk_pin_hash)`, lookup scopes by org | Scoping the index without scoping the lookup creates a cross-tenant auth hole. **The only deferred item with a frontend contract change.** |
| 6 | Storage path org-prefixing | Meaningless without the `storage.objects` policies it pairs with. |

Note for item 2: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction,
and the Supabase CLI wraps each migration in one. Those statements need their
own migration with the transaction disabled, or a deliberate run outside the
migration flow.

## Decisions

Settled in the grilling session of 2026-08-21/22. Recorded here because the spec
is where they are actionable; the two that are hard to reverse are also ADRs.

### D1 — The repo does not know its own schema, so spec A establishes it first

Four tables in daily use — `suppliers`, `invoices`, `invoice_lines`,
`classification_rules` — have no `CREATE TABLE` anywhere in the repo. Five more
files under `docs/migrations/` were applied by hand. Two migrations are both
numbered `062`. `supabase/README.md` documents the process as pasting SQL into
the dashboard SQL Editor.

Method: **baseline**, not retro-fit. See ADR-0006.

### D2 — `org_id` is `NOT NULL` with a column `DEFAULT`, dropped in spec B

There are 53 `.insert()` and 6 `.upsert()` call sites, and none can supply an
`orgId` — the value does not exist in the request path until phase 4. A column
`DEFAULT` pointing at the Angrybox org keeps every write working untouched and
keeps spec A free of DTO and controller changes.

The cost, stated plainly: a write that forgets `org_id` lands silently in
Angrybox rather than failing. Harmless with one org, which is the entire window
in which the default exists. Spec B's gate is a literal query — *zero columns
named `org_id` or `location_id` have a `column_default`*.

Because `ADD COLUMN … NOT NULL DEFAULT <constant>` is metadata-only in PG11+,
there is **no separate backfill pass**. The column appears filled, instantly,
with no table rewrite.

### D3 — `org_id` is denormalized onto every table

Not derived through FK chains. Only `organizations` is exempt. See ADR-0005.

### D4 — `location_id` goes on the event grain or the allocation grain

> `location_id` goes where the row is the grain at which "which store" is
> answered — either the **event grain** (something happened at a place) or the
> **allocation grain** (a cost is assigned to a place). It does not go on the
> entity or document that spans stores.

- **Event grain, `NOT NULL`:** `cash_closings`, `stock_movements`,
  `hr_work_shifts`, `hr_shift_attendance`.
- **Allocation grain, nullable:** `invoice_lines`.
- **Not on:** `invoices`, `stock_items`, `hr_employees`, `bank_accounts`,
  `suppliers`, `channels`, `cost_center_*`, `pizzas`, `banks`.

`hr_employees` stays org-level deliberately: location is a property of the
shift, so an employee transferring between stores does not mutate history.

Per-location stock counts come free — quantity is already derived as
`SUM(quantity)` over `stock_movements`, with no denormalized column on
`stock_items`.

### D5 — `invoice_lines.location_id` is nullable, and existing rows get `NULL`

`NULL` means the cost belongs to the organization and to no single store —
digital marketing, the accountant's fee, group insurance. An electricity bill
split across three stores becomes three lines, exactly as it already becomes
lines with different `cost_center_category_id`.

Existing rows backfill to `NULL`, **not** to the Angrybox location. This is the
one place in the pass where backfilling would invent a fact: no one has ever
made an allocation decision for these lines, and stamping them "Arcozelo" would
have to be audited away line by line when store #2 opens.

Known limitation: `NULL` cannot distinguish "org-wide by design" from "not yet
allocated". Accepted. The moment that distinction earns its keep is the moment
someone builds per-store P&L with an allocation UI, which is when to model it.

### D6 — Unique constraints get `org_id` only where their leading columns are not already org-determined

`unique (recipe_id, stock_item_id, size)`, `unique (import_id, line_index)`,
`unique (employee_id, year)`, `unique (movement_id, entity_id)` and their kin
are keyed on a parent that already carries `org_id`. They are left alone.

Rewritten:

| Table | Today | Becomes |
|---|---|---|
| `channels` | `code` unique | `(org_id, code)` |
| `cost_center_groups` | `code` unique | `(org_id, code)` |
| `cost_center_categories` | `code` unique | `(org_id, code)` |
| `stock_items` | partial unique idx on `sku` | `(org_id, sku)`, same predicate |
| `hr_public_holidays` | `date` unique | `(org_id, date)` |
| `supplier_article_mappings` | `(supplier_normalized, stock_item_id)` and `(supplier_normalized, description_normalized)` | both prefixed with `org_id` |
| `analytics_monthly_cache` | PK `(year, month)` | PK `(org_id, year, month)` |
| `bank_movements` | `deduplication_hash` unique | `(org_id, deduplication_hash)` |
| `vendus_product_mapping` | `(match_by, match_value)` unique | `(org_id, match_by, match_value)` |

The `bank_movements` one is not cosmetic: a global unique on a dedup hash means
org B importing a statement that collides with org A's **silently loses a
legitimate bank movement**, with no error anyone would see.

### D7 — Two carve-outs from D6

**`hr_employees.kiosk_pin_hash` stays globally unique.** Migration `033` creates
a global partial unique index; the lookups at
`src/modules/cash-closings/adapters/out/supabase-employee.repository.ts:7` and
`src/services/hrEmployeeService.ts:295` are
`.eq("kiosk_pin_hash", …).maybeSingle()` with **no org filter**, and they are
correct today only because the index is global. The kiosk request carries no
tenant identity at all — `GET /kiosk/daily-token` returns
`HMAC(HR_KIOSK_HMAC_SECRET, date)` from a single global secret, so every
tenant's kiosk would produce the identical token. Scoping the index while the
lookup stays blind converts a minor enumeration leak into a cross-tenant
authentication hole. Deferred as gate item 5.

**The four CRM text primary keys stay as they are.** `crm_customers.id`
(`'C001'`, `'C002'`, …), `crm_parameters.key`, `crm_scripts.code`
(`'2.1.1'`, `'CEN-05'`) and `crm_tags.name` are human-assigned natural keys that
are guaranteed to collide on the second tenant — every org's first customer is
`C001`. But restructuring them to `(org_id, <key>)` forces their children
(`crm_contacts`, `crm_orders`, `crm_customer_tags`) onto **composite foreign
keys**, which D8 defers to spec B. Doing this cluster in spec A would drag
composite FKs in with it and break the spec's mechanical character, and the work
is the same size whenever it happens. Deferred as gate item 4 — and it is the
item most likely to be forgotten, because unlike the others it fails loudly at
onboarding rather than silently.

These tables still get `org_id` in spec A like everything else. Only their key
structure is deferred.

### D8 — No composite FKs in spec A

Cross-org stitching requires two organizations to exist. Throughout spec A there
is exactly one, so every `org_id` in the database holds the same value and
divergence is not merely unlikely but impossible. Adding the constraints later
is fully online — `CREATE UNIQUE INDEX CONCURRENTLY`, then the FK as `NOT VALID`
followed by `VALIDATE CONSTRAINT`, which takes only `SHARE UPDATE EXCLUSIVE` —
and doing it inside the one-org window is what guarantees `VALIDATE` passes
first time. Gate item 1.

### D9 — `organizations` and `locations`

```
organizations
  id         uuid pk
  name       text not null
  nif        text not null unique
  address    text
  email      text
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()

locations
  id         uuid pk
  org_id     uuid not null references organizations(id)
  name       text not null
  code       text not null
  address    text
  timezone   text not null default 'Europe/Lisbon'
  is_active  boolean not null default true
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
  unique (org_id, code)
```

- **No `slug`, no `status`** — nothing in v1 reads either, and both are one-line
  additions later against a single row. `slug` is for white-label subdomains
  (phase 11); `status` would only be consumed by an RLS predicate, and spec B
  will know what values it needs.
- **`nif` is `NOT NULL UNIQUE`** because §2.3 makes one NIF the definition of the
  org boundary. This forecloses self-serve trial signup before a NIF is known —
  a deliberate consequence, not an oversight.
- **`timezone` lives on `locations`, not `organizations`**, because the service
  day closes ~2am (§3.4) and so the day boundary is a property of the store's
  wall clock. Portugal spans three offsets — the Azores are an hour behind the
  mainland — and `render.yaml` already carries a comment telling a human to
  hand-edit the cron from `30 1 * * *` to `30 0 * * *` every summer.
- `organizations` is **the one table with no `org_id`**; its `id` *is* the org id.

### D10 — `config/company.ts` is replaced in spec A, not spec C

The doc contradicts itself — phase 1 says org identity replaces it, phase 6 and
spec C say it is deleted there. Spec A wins, for the reason §5.1 gives itself: a
spec should be a unit of *verification*, and without this the `organizations`
row is inert data whose only acceptance criterion is "it exists". Reading the
NIF from the row on every generated PDF is the smallest honest end-to-end proof
that the tenant root is real and correctly seeded — on the one artifact where
being wrong is a legal problem.

`COMPANY` has exactly one consumer:
`src/modules/financial-base/adapters/in/financial-base.controller.ts:86-88`,
printing `name`, `nif`, `address`. `email` is never read.

"Replaces" here means *table-sourced*, not *tenant-aware*: identity still
resolves through a constant `DEFAULT_ORG_ID`. That is the whole point — the port
is already `findById(orgId)`, so spec C changes where the argument comes from and
nothing else.

The org id comes from a single `DEFAULT_ORG_ID` constant in the composition
root, which spec C deletes when auth supplies the real one. Spec C's
done-criterion narrows accordingly to *"`ENV.API_KEY` deleted, `DEFAULT_ORG_ID`
deleted, crons run per org"*.

### D11 — Verification is code review plus smoke tests, and the spec says so out loud

**The existing test suite cannot detect anything this spec breaks.** All 136 test
files live under `src/modules/**/__tests__` and use fakes for the output ports —
none constructs a Supabase client, so none touches a schema. `src/services/`
(39 files: HR, CRM, stock, DRE, analytics) and `src/routes/` have zero tests.
`createClient` is called without a `<Database>` type parameter, so `tsc` sees
`.from("anything")` as valid. **Green CI after this spec means nothing.**

Verification is therefore: code review, smoke tests against the local stack, and
one written deliverable — the upsert/`onConflict` audit (issue 07), which has a
known and enumerable break list.

Generated Supabase types and an integration-test layer were both considered and
declined *for this spec*: types would surface a large pile of pre-existing errors
across 403 untyped call sites and check the wrong thing (the `ALTER`s are
additive, so misspelled columns are not the risk); the integration layer belongs
in spec B, where the scoped query helper creates the seam to test against.

## Table inventory

52 tables. 48 have a `CREATE TABLE` in `supabase/migrations`; four
(`suppliers`, `invoices`, `invoice_lines`, `classification_rules`) exist only in
production until D1 lands.

**`org_id NOT NULL` — all except `organizations`:**

`analytics_monthly_cache`, `app_users`, `bank_accounts`,
`bank_movement_entity_links`, `bank_movement_match_hints`, `bank_movements`,
`bank_reconciliation_rules`, `bank_statement_imports`, `banks`, `cash_closings`,
`channels`, `classification_rules`, `cost_center_categories`,
`cost_center_groups`, `crm_contacts`, `crm_customer_tags`, `crm_customers`,
`crm_orders`, `crm_parameters`, `crm_scripts`, `crm_tags`, `dre_custos_fixos`,
`dre_custos_variaveis`, `dre_receita_bruta`, `hr_audit_logs`,
`hr_employee_documents`, `hr_employee_payments`, `hr_employees`,
`hr_leave_balances`, `hr_leave_requests`, `hr_public_holidays`,
`hr_shift_attendance`, `hr_work_shifts`, `invoice_lines`, `invoices`,
`locations`, `pizza_prices`, `pizza_recipe_items`, `pizza_recipes`, `pizzas`,
`preparation_items`, `preparations`, `recurring_contracts`,
`recurring_occurrences`, `stock_categories`, `stock_items`, `stock_movements`,
`supplier_article_mappings`, `supplier_import_hints`,
`supplier_invoice_import_lines`, `supplier_invoice_imports`, `suppliers`,
`vendus_product_mapping`

Two notes on that list:

- **`app_users`** gets `org_id` like everything else, even though ADR-0003
  replaces it with `org_members` in spec B. The absolute rule has one exemption,
  and this is not it.
- **`hr_public_holidays`** gets `org_id`, and Angrybox's seeded 2024–2027
  national holidays are simply stamped with it. No per-org seeding is written —
  that is only needed when a second org is provisioned. **`is_national` must
  survive the pass**: it is the discriminator that makes the eventual split into
  `public_holidays` (platform) + `org_holidays` (tenant) mechanical, and the
  canonical national list is public law, so tenant divergence never has to be
  reconciled.

**`location_id NOT NULL`:** `cash_closings`, `stock_movements`,
`hr_work_shifts`, `hr_shift_attendance`.

**`location_id` nullable:** `invoice_lines`.

## Issues

| # | Title | Blocked by |
|---|---|---|
| 01 | Baseline the schema and stand up the local Supabase stack | — |
| 02 | Local seed fixtures | 01 |
| 03 | Tenant root tables and the Angrybox seed | 01 |
| 04 | Org identity replaces `config/company.ts` | 03 |
| 05 | RLS audit, and close the four HR holes | 01 |
| 06 | The tenancy schema pass — one migration | 03 |
| 07 | Upsert / `onConflict` audit and fixes | 06 |
| 08 | Smoke verification | 04, 06, 07 |

## Risks

| Risk | Mitigation |
|---|---|
| The baseline is pushed to production and errors | It never runs there — `migration repair --status applied` writes it into the ledger without executing. `db pull` output contains `CREATE`s and no `DROP`s, so the worst case is "relation already exists" and a rolled-back transaction. |
| The archive leaks back into `supabase/migrations/` and `db push` queues 80 migrations for production | `supabase db push --dry-run` before every push. Any unexpected entry in the list is a stop signal. |
| `supabase db reset --linked` is run by muscle memory | One flag from the routine local command. Called out in issue 01; never scripted, never aliased. |
| Production drifts from the ledger again via the SQL Editor | The discipline rule *is* the mitigation: after baselining, no SQL Editor DDL — every change is a migration file. `db diff --linked` is the detector. |
| A forgotten `org_id` silently writes to Angrybox | Accepted for the duration of spec A (D2); impossible to matter with one org; gate item 3 closes it. |
| Real HR data on a laptop | Local fixtures are synthetic (issue 02). If a realistic-volume test is ever needed, restore with `hr_*` and `crm_*` scrubbed. |
| Green CI is mistaken for safety | Stated in D11 and in issue 08. |

## Noted, deliberately not decided

- `min_stock` sits on org-level `stock_items`, so all stores would share one
  reorder threshold. Revisit when a second location exists.
- `stock_movement_type` already has a `'transfer'` value whose meaning changes
  once locations are real — an inter-store transfer is arguably two movements.
- Splitting `hr_public_holidays` into `public_holidays` + `org_holidays` is the
  right end state; deferred, and `is_national` keeps it cheap.
- `bank_movement_entity_links.entity_id` is polymorphic (`entity_type IN
  ('invoice','payable_entry')`) with **no foreign key at all**. Unguarded today,
  unguarded after this spec, and not fixable by composite FKs.
- `cash_closings` has hardcoded channel columns (`uber`, `glovo`, `bolt`,
  `eatz`) — a tenant leak that belongs to spec D.
