# 03 — Phase 2a: composite FKs — suppliers & cost-center domain

**What to build:** A write naming another organization's supplier,
cost-center category, cost-center group, or cost center is rejected by the
database, not by application code. Add `FOREIGN KEY (org_id, <col>)
REFERENCES <target> (org_id, id)` for every reference into `suppliers`,
`cost_center_categories`, `cost_center_groups`, and `cost_centers` (22
references), built online: `NOT VALID` first, `VALIDATE CONSTRAINT` after,
in its own statement.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** done and verified

- [x] All 22 references into `suppliers`, `cost_center_categories`,
      `cost_center_groups`, `cost_centers` have `NOT VALID` composite FKs,
      then successfully `VALIDATE CONSTRAINT`ed
- [x] `supabase db reset` rebuilds the schema from the repository
- [x] Table sizes checked before validating against production-shaped data
      locally, so lock duration isn't discovered live
- [x] Smoke check per target table: a write naming the caller's own
      organization's identifier succeeds; the identical write naming a
      sibling organization's identifier is rejected with a named
      foreign-key-violation error
- [x] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP

## Smoke

Run against the local stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, API
`http://127.0.0.1:54321`), with the app server (`tsx watch src/server.ts`)
started on port 3334 (not the default 3333 — a stale, unrelated `tsx watch`
process from the main checkout was already bound there; see Comments) with
`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` pointed at the
local stack, plus the other env vars this repo's `src/config/env.ts`
requires at boot (`VENDUS_BASE_URL`, `AIRMENU_ENTERPRISES`,
`CREDENTIALS_ENCRYPTION_KEY`, `OPENAI_API_KEY`) filled with local-only
placeholder values, and Angrybox's `vendus_credentials`/`airmenu_credentials`
rows seeded via the two existing cutover scripts
(`vendus:credentials-cutover:dev`, `npx tsx src/jobs/runAirMenuCredentialsCutover.ts`)
with placeholder API keys, since `server.ts` fails hard at boot otherwise.
`.env` itself was never touched — every value above was passed inline as an
env var for that one process only.

**Migration applied clean.** `npx supabase db reset` rebuilt the full schema
(every migration through `20260908100000_composite_fks_phase2a_suppliers_cost_centers.sql`)
with no errors. Direct SQL against `pg_constraint` confirmed all 22 new
composite FKs present with `convalidated = true`, and all 4 `..._org_id_id_key`
unique constraints (`suppliers_org_id_id_key`, `cost_center_categories_org_id_id_key`,
`cost_center_groups_org_id_id_key`, `cost_centers_org_id_id_key`) present —
re-checked twice more during the smoke (before and after the HTTP/SQL
writes) to confirm nothing regressed mid-run: `fk_count 22, all_true True,
uq_count 4` both times.

**Table sizes** (local stack — seed-only, as expected), checked before any
`VALIDATE CONSTRAINT` risk was taken seriously: `suppliers` 5,
`cost_center_categories` 7, `cost_center_groups` 4, `cost_centers` 5,
`bank_movement_match_hints` 0, `bank_movements` 0, `classification_rules` 2,
`invoices` 6, `invoice_lines` 8, `payable_entries` 6, `recurring_contracts`
0, `supplier_import_hints` 0. All small enough that `VALIDATE CONSTRAINT`'s
scan cost is a non-issue locally — this is about the habit, not a finding.

**Two organizations.** Only Angrybox existed after `db reset` (this is a
from-scratch reset seeded from `supabase/seed.sql`/`supabase/seeds/*`, not a
persistent local database — ticket 21's "Segunda Organização" did not
survive). Provisioned a second organization directly against
`organizations`/`locations`/`auth.users`/`org_members` (same shape
`src/services/organizationProvisioningService.ts` produces) rather than the
interactive `org:provision:dev` script, since it prompts on a TTY the
harness doesn't have: `Segunda Organização` (`org_id
b2978c9b-1fb3-4edb-ba1e-c4098f101d35`), one location, and an admin
(`admin@segundaorg.test` / `Sup3rSecret!23`). Angrybox itself had no admin
user left from any previous run either, so one was created the same way
(`admin@angrybox.test` / `Sup3rSecret!23`, org_id
`b6999cff-79b2-4583-b8b4-a744b3ace748`). Both signed in for real against
local GoTrue (password grant) and both tokens decode with the right claims:
Angrybox's `org_id: b6999cff-...`, `org_role: admin`; Segunda's `org_id:
b2978c9b-...`, `org_role: admin`. Every check below used these two real
bearer tokens.

Segunda had no supplier/category/group/cost-center of its own to name in the
cross-org direction, so one of each was created first, as Segunda's own
admin: `POST /api/financial-base/suppliers` → `Smoke-Segunda-Supplier`
(`f73a4ca7-bdcc-480d-85ea-fb0f8c84a604`); `POST
/api/financial-base/cost-center-groups` → `Smoke-Segunda-Group`
(`625e9db9-e74b-4e04-8cfb-7d6a709e08b6`); `POST
/api/financial-base/cost-center-categories` (`groupId` pointed at the group
just created) → `Smoke-Segunda-Category` (`8431a16e-6a19-45f8-89f9-c76900e6d057`).

**suppliers — `invoices.supplier_id`, `POST /api/invoices`.** As Angrybox's
admin, naming Segunda's supplier id:
`{"supplierId":"f73a4ca7-...","supplierName":"Smoke-Segunda-Supplier","invoiceNumber":"SMOKE-XORG-SUP-001",...}`
→ `400 {"error":"insert or update on table \"invoices\" violates foreign key
constraint \"invoices_org_id_supplier_id_fkey\""}`. The identical shape
naming Angrybox's own supplier (`f82374a1-6038-4383-88fa-38c5fbdf4368`,
"Quinta do Sabor Distribuição, Lda") → `201`, invoice
`8a684c1b-d63b-4a34-bec4-46b335c8a771` created.

**cost_center_categories — `invoices.cost_center_category_id`, same `POST
/api/invoices`.** As Angrybox's admin, naming Segunda's category id on an
otherwise-valid invoice → `400 {"error":"insert or update on table
\"invoices\" violates foreign key constraint
\"invoices_org_id_cost_center_category_id_fkey\""}`. Naming Angrybox's own
category (`fd10a08f-6282-4f86-88a0-3171a7bd8efb`, "Salários") on the
supplier check above → `201` (the same request that created
`8a684c1b-...` also carried this category, confirming both FKs on one real
write).

**cost_center_groups — `invoices.cost_center_group_id`, same `POST
/api/invoices`.** First tried via `POST /api/financial-base/cost-center-categories`
(`body.groupId`, the ticket's suggested pick, "required field, no need to
hunt for an optional one") — but that use case does its own org-scoped
existence check before ever reaching the database (`422 {"error":"Grupo de
centro de custo \"625e9db9-...\" não encontrado"}`), so the *application*
rejects it before the FK is ever exercised — not what this check is for.
Switched to `invoices.cost_center_group_id` on the same `POST /api/invoices`
endpoint used above, which inserts directly with no pre-check: naming
Segunda's group id → `400 {"error":"insert or update on table \"invoices\"
violates foreign key constraint \"invoices_org_id_cost_center_group_id_fkey\""}`.
Naming Angrybox's own group (`9995aef6-f3af-497c-81fe-e799d502d6f1`, "Custo
de Mercadoria Vendida") → `201`, invoice
`e82a4ce1-0d8c-4b21-96d4-7c140e4ae81a` created.

**cost_centers — `invoice_lines.cost_center_id`, direct SQL (no HTTP path
exists).** Both of this target's two references
(`classification_rules.default_cost_center_id`,
`invoice_lines.cost_center_id`) are "Low"/dead per ticket 01's audit — no
controller or use case ever sets either from a caller-supplied value
(`invoices/README.md` already flags both for removal). Segunda had no
`cost_centers` row of its own either (no create endpoint reachable), so one
was inserted directly as `postgres`
(`11111111-1111-1111-1111-111111111111`, `Smoke-Segunda-CC`). As `postgres`,
inserting an `invoice_lines` row stamped `org_id = Angrybox` naming that
Segunda cost center → `ERROR: insert or update on table "invoice_lines"
violates foreign key constraint "invoice_lines_org_id_cost_center_id_fkey"`.
The identical insert naming Angrybox's own cost center
(`c0467034-3b90-4219-91e5-599590f94db5`, "Cozinha") on the same invoice →
succeeded (`invoice_lines` row `22222222-2222-2222-2222-222222222222`
returned `org_id`/`cost_center_id` matching what was inserted).

**Direct-SQL fallback needed for:** `cost_centers` only (both its
references are dead/no-HTTP-path per the audit), plus the one-off
`cost_centers` seed row for Segunda described above (no create endpoint for
this table at all, regardless of tier). Every other target table's check
went through a real HTTP request with a caller-supplied identifier.

**Cleanup.** Every row created for this smoke was deleted afterward: the one
`invoice_lines` row (`22222222-...`), both invoices (`8a684c1b-...`,
`e82a4ce1-...`), both `cost_center_categories` rows (Segunda's
`8431a16e-...` and Angrybox's `5aa18117-...` — created while probing the
groupId pre-check dead end above), the one `cost_center_groups` row
(`625e9db9-...`), the one `cost_centers` row (`11111111-...`), and the one
`suppliers` row (`f73a4ca7-...`). Re-checked afterward: table-size query
returned exactly the pre-smoke baseline for every table
(`suppliers` 5, `cost_center_categories` 7, `cost_center_groups` 4,
`cost_centers` 5, `invoices` 6, `invoice_lines` 8, `payable_entries`
unchanged at 6 throughout — confirming no invoice with a due date was
created, so no stray payable entry either). The second organization
(Segunda Organização), its location, and both admin users
(`admin@angrybox.test`, `admin@segundaorg.test`) were deliberately left in
place, matching ticket 21's precedent — a later ticket (07) needs two
organizations again.
