# 01 — Audit pass: rank the 65 composite-FK targets, confirm phase-1's index candidates

**What to build:** A ranked, complete inventory that the rest of this spec
builds from — not code. For phase 2: every one of the 65 pre-existing
foreign-key references, ranked by risk and user-facing-ness (an HR employee
id reached from an authenticated write endpoint ranks above a
`dre_custos_fixos` classification-rule reference nobody's UI supplies
directly), with the two named exceptions (`crm_customer_actions.created_by`
→ `auth.users`, and `bank_movement_entity_links`'s polymorphic
`(entity_type, entity_id)` pair) flagged explicitly rather than folded into
the mechanical count. For phase 1: the actual `WHERE`/`ORDER BY` shapes the
scoped query helper's call sites produce today, checked against the 96
existing indexes, so the index batch targets query shapes that exist, not
every index that happens to exist.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Ranked table of all 65 references produced, covering every target
      table in the spec's starting inventory (Further Notes), with nothing
      added or dropped without explanation
- [x] The two named exceptions are flagged in the table, not silently
      counted toward the mechanical 63
- [x] Phase 1's candidate list of `(org_id, …)` indexes is confirmed against
      the scoped query helper's actual call sites, with `hr_employees_kiosk_pin_hash_uq`
      explicitly excluded
- [x] Completeness check: every row from the spec's D6 inventory appears
      exactly once in the ranked table

## Audit

### Method

Every FK in the pre-tenancy baseline (`supabase/migrations/20260822141653_remote_schema.sql`)
was re-extracted directly (66 single-column constraints, minus the dropped
`app_users.id → auth.users.id`, leaves 65 — reconciled row-for-row against
D6/Further Notes' per-target-table counts; all match exactly, see
Completeness check below).

Ranking is by **tier**, not a strict 1–65 order — the spec's own example
("an HR employee id reached from an authenticated write endpoint ranks above
a `dre_custos_fixos` reference nobody's UI supplies directly") is a
high-vs-low contrast, not a demand for a total order, and a strict order
across 65 heterogeneous references would manufacture false precision. Each
of the 65 was traced to its actual write path (HTTP body field, URL param,
or "no client path — internal only") by reading the real controller/DTO/
use-case code, not by assuming a column is reachable because a route exists
for its table.

- **High** — a caller-supplied value (body field or URL/path param) on an
  authenticated write endpoint reaches this column directly today, and the
  target table holds financial or personal data (money, bank accounts,
  suppliers, invoices, stock movements, HR employees, CRM customers).
- **Medium** — caller-supplied the same way, but the target table is
  internal classification/config (cost center categories/groups, channels,
  tags) or low-stakes operational data (menu/recipe/preparation structure) —
  a mistargeted write misfiles data rather than exposing or corrupting
  another organization's core financial or personal record.
- **Low** — no client-facing write path reaches this column today: it's
  set internally by a use case/job from an already-validated value, or the
  column is dead/unused in current application code. The FK is still worth
  adding (defense-in-depth, and it stops silently going stale the day
  someone *does* expose the field), but nothing exploitable exists right
  now.

### High — caller-supplied, target is financial/PII (24)

| Source.column | → Target | Reachable via |
|---|---|---|
| `crm_customers.referred_by` (self) | `crm_customers` | `PATCH /api/crm/customers/:id` — **no schema validation at all**, raw body forwarded |
| `hr_work_shifts.employee_id` | `hr_employees` | `POST /api/hr/shifts` — `body.employeeId`, required |
| `hr_employee_payments.employee_id` | `hr_employees` | `POST /api/hr/employees/:id/payments` — path param (payroll) |
| `hr_employee_documents.employee_id` | `hr_employees` | `POST /api/hr/employees/:id/documents` — path param (contracts/ID docs) |
| `hr_shift_attendance.work_shift_id` | `hr_work_shifts` | `PATCH /api/hr/shifts/:id/attendance` — path param, upsert |
| `hr_shift_attendance.registered_by_employee_id` | `hr_employees` | `PATCH /api/hr/shifts/:id/attendance` — `body.registeredByEmployeeId`, optional |
| `crm_contacts.customer_id` | `crm_customers` | `POST /api/crm/contacts` — `body.customerId` |
| `crm_customer_actions.customer_id` | `crm_customers` | `POST /api/crm/actions` — `body.customerIds[]` |
| `crm_customer_tags.customer_id` | `crm_customers` | `PATCH /api/crm/customers/tags` — `body.customerIds[]` |
| `crm_orders.customer_id` | `crm_customers` | `POST /api/crm/customers/:id/orders` — path param |
| `crm_customer_actions.action_type_code` | `crm_action_types` | `POST /api/crm/actions` — `body.actionTypeCode`, not validated against the target table at the boundary |
| `invoices.supplier_id` | `suppliers` | `POST /invoices`, `PATCH /invoices/:id`, `POST /invoices/:id/confirm` |
| `payable_entries.supplier_id` | `suppliers` | `POST /payable-entries` — `body.supplierId` (create only) |
| `recurring_contracts.supplier_id` | `suppliers` | `POST /payable-recurrences`, `PATCH /payable-recurrences/:id` (body spread) |
| `bank_movements.supplier_id` | `suppliers` | `PATCH /bank-statements/movements/:movId/classify` — `body.supplierId` |
| `stock_movements.item_id` | `stock_items` | `POST /api/stock/movements` — `body.item_id`, required (inventory-cost-bearing) |
| `bank_movements.bank_account_id` | `bank_accounts` | `POST /bank-statements` — `body.bankAccountId` |
| `bank_statement_imports.bank_account_id` | `bank_accounts` | `POST /bank-statements`, `PATCH /bank-statements/:id/link-account` |
| `recurring_occurrences.payment_bank_account_id` | `bank_accounts` | `PATCH /payable-recurrences/occurrences/:occId/pay` — `body.paymentBankAccountId` |
| `bank_accounts.bank_id` | `banks` | `POST /bank-accounts/banks/:bankId/accounts` — path param |
| `bank_movement_entity_links.movement_id` | `bank_movements` | `PATCH /bank-statements/movements/:movId/reconcile` — path param |
| `invoice_lines.invoice_id` | `invoices` | `POST /invoices/:invoiceId/lines` — path param |
| `recurring_occurrences.invoice_id` | `invoices` | `PATCH /payable-recurrences/occurrences/:occId/link-invoice` — `body.invoiceId` |
| `recurring_occurrences.recurrence_id` | `recurring_contracts` | `POST /payable-recurrences/:id/occurrences/generate` — path param |

### Medium — caller-supplied, target is internal classification/operational (25)

| Source.column | → Target | Reachable via |
|---|---|---|
| `supplier_article_mappings.stock_item_id` | `stock_items` | `POST /stock/invoice-imports/:id/confirm` — `body.lines[].stock_item_id` |
| `supplier_invoice_import_lines.stock_item_id` | `stock_items` | same route |
| `stock_items.category_id` | `stock_categories` | `POST /api/stock/items` — `body.category_id`, required |
| `pizza_recipe_items.stock_item_id` | `stock_items` | `POST /pizzas/:pizzaId/recipes/:recipeId/items` — `body.stock_item_id` |
| `preparation_items.stock_item_id` | `stock_items` | `POST /preparations/:id/items` — `body.stock_item_id` |
| `pizza_recipe_items.recipe_id` | `pizza_recipes` | `POST /pizzas/:pizzaId/recipes/:recipeId/items` — path param |
| `pizza_prices.pizza_id` | `pizzas` | `POST /pizzas/:pizzaId/prices` — path param |
| `pizza_recipes.pizza_id` | `pizzas` | `POST /pizzas/:pizzaId/recipes` — path param |
| `pizza_recipe_items.preparation_id` | `preparations` | `POST /pizzas/:pizzaId/recipes/:recipeId/items` — `body.preparation_id` |
| `preparation_items.preparation_id` | `preparations` | `POST /preparations/:id/items` — path param |
| `crm_customer_tags.tag_name` | `crm_tags` | `PATCH /api/crm/customers/tags` — `body.add[]` |
| `bank_movements.cost_center_category_id` | `cost_center_categories` | `PATCH .../classify` — `body.costCenterCategoryId` |
| `invoice_lines.cost_center_category_id` | `cost_center_categories` | `POST/PATCH` invoice-line body/classify |
| `invoices.cost_center_category_id` | `cost_center_categories` | `POST/PATCH/confirm` invoices |
| `recurring_contracts.cost_center_category_id` | `cost_center_categories` | `POST/PATCH` payable-recurrences (body spread) |
| `suppliers.default_cost_center_category_id` | `cost_center_categories` | `POST/PATCH` financial-base suppliers |
| `classification_rules.default_cost_center_category_id` | `cost_center_categories` | `PATCH .../classify` with `saveAsRule:true` |
| `bank_movements.cost_center_group_id` | `cost_center_groups` | `PATCH .../classify` — `body.costCenterGroupId` |
| `cost_center_categories.group_id` | `cost_center_groups` | `POST /financial-base/cost-center-categories` — `body.groupId`, required |
| `invoices.cost_center_group_id` | `cost_center_groups` | `POST/PATCH/confirm` invoices |
| `payable_entries.cost_center_id` | `cost_center_groups` | `POST/PATCH` — `body.costCenterId` |
| `recurring_contracts.cost_center_id` | `cost_center_groups` | `POST/PATCH` payable-recurrences (body spread) |
| `suppliers.default_cost_center_group_id` | `cost_center_groups` | `POST/PATCH` financial-base suppliers |
| `classification_rules.channel_id` | `channels` | `PATCH .../classify` with `saveAsRule:true` |
| `invoice_lines.channel_id` | `channels` | `PATCH .../classify` — `body.classify.channelId` |

### Low — no client-facing write path today (15)

| Source.column | → Target | Why it's low today |
|---|---|---|
| `cash_closings.employee_id` | `hr_employees` | Deliberately not client-suppliable — `POST /api/cash-closings/submit` takes only a `pin`; the employee id is resolved server-side via `VerifyPinPort`, org-scoped. Code comment explicitly says this avoids trusting a client-sent id. |
| `bank_movements.statement_import_id` | `bank_statement_imports` | Internal — stamped by the import use case on every parsed movement |
| `payable_entries.invoice_id` | `invoices` | Internal — invoices-module use cases write it via a server-generated id; `payable_entries`' own create/update commands have no `invoiceId` field |
| `bank_movement_match_hints.supplier_id` | `suppliers` | Internal — auto-saved from `entityLinks[].supplierId` during reconcile; the hints table itself has no direct write endpoint |
| `classification_rules.supplier_id` | `suppliers` | Internal — set from the invoice's already-persisted `supplierId` when `saveAsRule=true` |
| `supplier_invoice_import_lines.import_id` | `supplier_invoice_imports` | Internal — stamped with the new import's server-generated id |
| `supplier_invoice_imports.duplicate_of_import_id` (self) | `supplier_invoice_imports` | Internal — business-key duplicate-detection logic computes it server-side |
| `recurring_occurrences.payable_entry_id` | `payable_entries` | **Orphaned** — zero reads or writes anywhere in `src/`; exists only in the schema |
| `invoice_lines.ai_suggested_category_id` | `cost_center_categories` | **Dead** — `InvoiceLine.create()` hardcodes `null`; no use case ever writes a real value |
| `classification_rules.default_cost_center_id` | `cost_centers` | **Dead** — no controller/use-case ever sets it; `invoices/README.md` already flags this column for removal |
| `invoice_lines.cost_center_id` | `cost_centers` | **Dead** — same removal note as above; only `cost_center_category_id` is exposed at the boundary |
| `vendus_product_mapping.stock_item_id` | `stock_items` | Admin/SQL-managed only — no insert/update/upsert anywhere in `src`; seeded via an archived migration |
| `vendus_product_mapping.pizza_id` | `pizzas` | Same as above |
| `crm_customer_actions.source_contact_id` | `crm_contacts` | **Dead** — only an archived one-time backfill migration ever touched it |
| `supplier_import_hints.supplier_id` | `suppliers` | Internal hint flow, analogous to `bank_movement_match_hints`. Weakest-evidence row in this audit — the calling use case wasn't fully traced; worth a quick confirm before phase 2 rather than re-litigating the tier. |

**Total tiered: 24 + 25 + 15 = 64.**

### Named exceptions — flagged, not folded into the tiers above

Both are named explicitly in the spec (User Story 8, D6) as not fitting
`FOREIGN KEY (org_id, col) REFERENCES target (org_id, id)` mechanically.
Reading the actual schema and code surfaces a distinction the spec's own
"two of the 65... not folded into the mechanical 63" phrasing glosses over,
so it's recorded here rather than silently reconciled:

1. **`crm_customer_actions.created_by → auth.users.id`.** This **is** one
   of the 65 formal FK constraints (confirmed present in the baseline
   migration). Reachable via `POST /api/crm/actions`, but not
   caller-suppliable in practice — the controller sets
   `createdBy: req.auth!.sub` server-side from the authenticated session,
   never from the request body. Matches the spec's own framing: an
   audit-log field recording *who acted*, not *what tenant data was
   touched*. `auth.users` has no `org_id` to compose a composite FK
   against (ADR-0003/D3) — needs its own decision, not this ticket's.

2. **`bank_movement_entity_links.(entity_type, entity_id)`.** Confirmed
   **no formal FK constraint exists for this pair today** — the table's
   only FK is `movement_id → bank_movements.id`, which is an ordinary,
   already-tiered reference (High, above), not the exception. The
   polymorphic pair is a **separate, additional hazard the spec chose to
   name alongside the 65**, not literally one of the 65 counted
   constraints — there is nothing to count, since no constraint exists to
   convert. It **is** caller-supplied and live today:
   `PATCH /bank-statements/movements/:movId/reconcile` lets a caller set
   both `entityType` and `entityId` directly per `body.entityLinks[]`
   entry, and `entityType` isn't even runtime-validated against
   `"invoice"|"payable_entry"` — it's cast, so a non-matching string
   silently falls into the `payable_entry` branch. The only protection
   today is application-level: `reconcile-movement.use-case.ts` resolves
   `entityId` through an org-scoped lookup and throws "not found" outside
   the caller's org. This is arguably the **highest-risk single reference
   in the whole audit** given it has zero DB-level backing today, but it
   is explicitly out of this spec's phase 2 (D6, Out of Scope) — named
   here per the ticket's own requirement, not scheduled for a fix.

**Reconciled count:** 65 formal FK constraints exist. One of them
(`crm_customer_actions.created_by`) is a named exception → **64 mechanical
constraints** get the straightforward composite-FK treatment in phase 2
(the 64 tiered above). The second named exception
(`bank_movement_entity_links`'s polymorphic pair) sits **outside** the
65-constraint count entirely — it has no existing constraint to convert —
so the spec's own "63" arithmetic (65 − 2) doesn't hold on a literal
constraint count; the correct statement is **64 mechanical + 2 named
exceptions, one of which (`created_by`) is inside the 65 and one of which
(`bank_movement_entity_links`) is additional to it**. Flagging this
discrepancy rather than silently forcing the spec's own arithmetic to
balance.

### Completeness check

Every target table from D6/Further Notes' starting inventory reconciles
exactly against this audit's own extraction of
`supabase/migrations/20260822141653_remote_schema.sql`:

| Target table | D6 count | This audit | Match |
|---|---|---|---|
| suppliers | 7 | 7 | ✅ |
| cost_center_categories | 7 | 7 | ✅ |
| cost_center_groups | 6 | 6 | ✅ |
| stock_items | 6 | 6 | ✅ |
| crm_customers | 5 | 5 | ✅ |
| hr_employees | 5 | 5 | ✅ |
| bank_accounts | 3 | 3 | ✅ |
| invoices | 3 | 3 | ✅ |
| pizzas | 3 | 3 | ✅ |
| channels | 2 | 2 | ✅ |
| cost_centers | 2 | 2 | ✅ |
| preparations | 2 | 2 | ✅ |
| supplier_invoice_imports | 2 (1 self) | 2 (1 self) | ✅ |
| banks, bank_movements, bank_statement_imports, crm_action_types, crm_contacts, crm_tags, hr_work_shifts, pizza_recipes, recurring_contracts, payable_entries, stock_categories | 1 each (11) | 1 each (11) | ✅ |
| auth.users | 1 (exception) | 1 (exception) | ✅ |
| **Total** | **65** | **65** | ✅ |

64 tiered rows + 1 exception inside the 65 (`created_by`) = 65, matching
D6 exactly. No row added or dropped. `crm_customers.referred_by` (self) is
included under its own target row per D6's own note ("`crm_customers` also
self-references... same treatment as any other reference to it").
`bank_movement_entity_links`'s polymorphic pair is additional to this
table, per the reconciliation above.

### Phase 1 — index candidates confirmed against real call sites

96 existing indexes confirmed (92 in the pre-tenancy baseline + 1 in
`20260822150000_tenancy_schema_pass.sql` + 2 in the location-credentials
migration + 1 in the airmenu-credentials migration). Four of those 96 —
`airmenu_location_config_org_id_location_id_idx`,
`idx_stock_items_org_id_sku`, `pairing_codes_org_id_location_id_idx`,
`location_tokens_org_id_location_id_idx` — are already `org_id`-prefixed
(new-pattern tables) and aren't phase-1 candidates.

`ScopedQuery.table(name)` call sites (`src/infra/scoped-db/scoped-query.ts`)
were traced across all 13 modules that use the helper, plus `src/jobs/`.
Per D4, `org_id` is only worth prepending where a real call site filters or
orders by that column together with `org_id`. Confirmed candidates, with
file:line evidence, all of which already have a single-column index today
that org_id-prefixing would extend:

| Table | Extra column(s) | Existing index to extend |
|---|---|---|
| `bank_movements` | `statement_import_id` | `bank_movements_statement_idx` |
| `bank_movements` | `reconciliation_status` | `bank_movements_status_idx` |
| `bank_movements` | `risk_level` | `bank_movements_risk_idx` |
| `bank_movements` | `booking_date` (range + order) | `bank_movements_booking_date_idx` |
| `bank_statement_imports` | `account_number` | `bank_statement_imports_account_idx` |
| `bank_statement_imports` | `period_start`/`period_end` | `bank_statement_imports_period_idx` |
| `bank_statement_imports` | `bank_account_id` | `idx_bank_statement_imports_bank_account_id` |
| `cash_closings` | `status` | `cash_closings_status_idx` |
| `cash_closings` | `employee_id` | `cash_closings_employee_id_idx` |
| `cash_closings` | `closing_date` (range + order) | `cash_closings_closing_date_idx` |
| `crm_customer_actions` | `customer_id` | `crm_customer_actions_customer_idx` |
| `crm_customer_tags` | `customer_id` | `crm_customer_tags_customer_idx` |
| `classification_rules` | `supplier_id` | `idx_classification_rules_supplier` |
| `hr_employees` | `status` | `idx_hr_employees_status` |
| `invoices` | `supplier_id` | `idx_invoices_supplier_id` |
| `invoices` | `status` | `idx_invoices_status` |
| `invoices` | `reconciliation_status` | `idx_invoices_reconciliation_status` |
| `invoices` | `invoice_date` (range + order) | `idx_invoices_invoice_date` |
| `invoice_lines` | `invoice_id` | `idx_invoice_lines_invoice_id` |
| `invoice_lines` | `cost_center_id` | `idx_invoice_lines_cost_center` |
| `bank_movement_entity_links` | `movement_id` | `idx_bmei_movement_id` |
| `recurring_contracts` | `status` | `idx_recurring_contracts_status` |
| `recurring_contracts` | `type` | `idx_recurring_contracts_type` |
| `recurring_contracts` | `supplier_id` | `idx_recurring_contracts_supplier` |
| `recurring_occurrences` | `recurrence_id` | `idx_recurring_occurrences_recurrence` |
| `recurring_occurrences` | `period` | `idx_recurring_occurrences_period` |
| `recurring_occurrences` | `status` | `idx_recurring_occurrences_status` |
| `recurring_occurrences` | `due_date` (range + order) | `idx_recurring_occurrences_due_date` |
| `supplier_import_hints` | `normalized_name` | `idx_supplier_import_hints_normalized_name` |
| `bank_movement_match_hints` | `normalized_description` | `idx_bank_movement_match_hints_desc` |

Already-composite indexes with real call-site evidence, unchanged (no
single column to prepend, the pair is already the query shape):
`bank_movements_account_date_idx`, `crm_customer_actions_completed_idx`,
`crm_customer_actions_pending_idx`, `idx_invoices_pending_direct_debits`,
`idx_bmel_entity`.

**`hr_employees_kiosk_pin_hash_uq`** — confirmed present (unique, partial,
on `hr_employees(kiosk_pin_hash)`). It does have real `ScopedQuery`
evidence (`cash-closings/adapters/out/supabase-employee.repository.ts:22`),
but per D4/D6 it is **excluded unconditionally** — kiosk PIN collision is
deferred item 5's job, not this spec's, regardless of query-shape findings.

**Cross-cutting finding worth flagging to the spec, not fixed here:**
several High-tier phase-2 tables — `hr_work_shifts`, `hr_employee_payments`,
`hr_employee_documents`, `hr_shift_attendance`, `stock_items`,
`stock_movements`, and everything under `pizza_*`/`preparation_*` — have
**no `ScopedQuery` call-site evidence at all**, because those modules
haven't migrated to the hexagonal/`ScopedQuery` pattern yet (confirmed:
legacy route/service files, not `adapters/out/*.repository.ts`). D4's
method can't evaluate them, so their existing single-column indexes are
correctly left alone for now — not confirmed-safe, just out of phase 1's
reach until those modules migrate. This means phase 2's FK candidate list
and phase 1's index candidate list don't fully overlap by module today.

**Two more out-of-D4's-literal-scope observations from the same pass:**
- `crm_contacts_customer_id_idx`, `crm_orders_customer_id_idx`,
  `crm_orders_order_date_idx` exist, but the only real `ScopedQuery` call
  site for those tables fetches the whole table per-org with no `.eq()` on
  those columns — no real-query evidence, so per D4 they're left alone
  (not turned into candidates just because the index already exists).
- `payable_entries` is really filtered by `supplier_id`, `cost_center_id`,
  `status`, `invoice_id` and `due_date` at real call sites, but has **no
  existing single-column index on any of them** to prepend `org_id` to
  (`idx_payable_entries_source` is the only existing index, and `source`
  isn't filtered anywhere). That's a net-new-index question, not an
  `org_id`-prefixing one — outside this ticket's scope, flagged for
  whoever writes phase 1's migration.
