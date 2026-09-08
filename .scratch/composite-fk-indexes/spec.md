# Composite FKs & indexes — closing the gate's biggest remaining item

> Status: done (all tickets 01-07 closed)
> Última atualização: 2026-09-08
> Architecture reference: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §5.1 (the hard
> gate), §2.4/§2.6 (denormalization and enforcement)
> ADRs: `docs/adr/0005` (`org_id` denormalized, composite FKs are what proves
> it didn't drift), `docs/adr/0009` (the worked example — location's 5
> composite FKs — this spec replicates its technique for the rest)
> Predecessors: `.scratch/_done/org-location-foundation/spec.md` (spec A —
> D8, the original deferral and online-migration technique), `.scratch/_done/scoped-access/spec.md`
> (spec B2 — D16, the audit that counted these and drew the "B2 closes the
> hazards B2 creates; pre-existing ones stay behind the gate" line)
> Written in English, per the architecture document's own convention.

---

## Problem Statement

Spec A denormalized `org_id` onto every table instead of deriving it through
foreign-key chains (ADR-0005). That decision's honesty depends on a promise
it explicitly didn't keep yet: "a copy can drift from its source... answered
by composite foreign keys... which make the copy something Postgres proves
rather than something the application maintains." Nothing proves it today.

Every write endpoint that accepts an identifier — an employee id on a shift,
a stock item id on a movement, a supplier id on an invoice — validates that
the *row being written* belongs to the caller's organization, because the
scoped query helper stamps `org_id` on every insert. It does **not** validate
that the *identifier being referenced* does. A caller authenticated as
organization A can write a `stock_movements` row stamped `org_id = A` whose
`item_id` names organization B's stock item, and nothing in the database or
the application rejects it. The same shape repeats across roughly two dozen
distinct target tables and 65 referencing foreign keys — every one of them
predates spec B2, and B2's own D16 deliberately left every one of them behind
the gate: *"B2 closes the hazards B2 creates; pre-existing ones stay behind
the gate."*

This is not a theoretical hole. It is the reason spec A's hard gate exists at
all: **no second `organizations` row until the deferred register's first
group lands**, and this is that group's largest member by volume. Spec B2
closed the 5 location foreign keys it introduced itself (ADR-0009) as a
narrow, deliberate exception. It also identified, but did not fix, **14
embedded `select` queries** that are safe *only* because no cross-organization
foreign key can exist in the data yet — an embedded select follows a foreign
key from an already-filtered parent without its own `org_id` predicate, so it
leaks the instant a cross-org row can exist. Closing the composite keys is
what makes those 14 reads safe again, or reveals that some of them need a
second look.

A second, unrelated problem shares the same deferred-item family and the same
online-migration mechanics, which is why it rides along in this spec rather
than its own: with exactly one organization, `org_id` has one distinct value
on every table, and no composite `(org_id, …)` index buys the query planner
anything. That stops being true the moment a second organization exists with
real data volume. Unlike the foreign-key item, this one is pure performance —
nothing is unsafe today, a query just may not use the index the planner will
eventually want.

## Solution

Two independent migrations, sequenced so the cheaper one runs first and the
riskier one can reuse its output.

**Phase 1 — composite indexes.** Every `(org_id, …)` index this spec adds —
whether it exists purely to help the planner, or exists because a downstream
foreign key needs a `UNIQUE (org_id, id)` to reference — is built the same
way: `CREATE UNIQUE INDEX CONCURRENTLY` / `CREATE INDEX CONCURRENTLY`. Nothing
in this phase changes what a write is allowed to do. Its claim is narrow and
purely observational: **the query planner can choose these indexes** for the
query shapes the scoped query helper actually produces.

**Phase 2 — composite foreign keys.** For each of the ~65 pre-existing,
caller-supplied identifier references, add `FOREIGN KEY (org_id, <col>)
REFERENCES <target> (org_id, id)`, built online: `NOT VALID` first (an
`ACCESS EXCLUSIVE` lock only long enough to record the constraint's
existence), then `VALIDATE CONSTRAINT` in its own statement (`SHARE UPDATE
EXCLUSIVE`, does not block reads or writes). Its claim is the real security
fix and is unambiguous: **a write naming another organization's employee,
stock item, supplier, invoice, etc. is rejected by the database**, not
merely "would be unlikely to happen."

The two claims are not the same thing and are not verified the same way, and
this spec keeps them in clearly separate sections throughout rather than
folding "the index exists" into "the write is rejected" or vice versa.

### What this spec deliberately is not

- **Not the CRM primary-key restructuring** (deferred register item 4).
  `crm_customers.id`, `crm_parameters.key`, `crm_scripts.code`,
  `crm_tags.name` are human-assigned text keys that collide across tenants
  the moment a second organization's first customer is created — a data
  model problem, not a missing-constraint problem. This spec's phase 2 *does*
  add composite FKs from `crm_contacts`, `crm_customer_actions`,
  `crm_customer_tags` and `crm_orders` to these tables like any other
  reference, which is a prerequisite for item 4 (its restructuring needs the
  children to already resolve through composite keys) but does not itself
  touch the text-key collision.
- **Not the kiosk PIN fix** (deferred register item 5).
  `hr_employees_kiosk_pin_hash_uq` is a global unique index with no `org_id`,
  and fixing it needs a QR-payload/frontend contract change. Untouched here.
- **Not storage path org-prefixing** (item 6). Unrelated table, unrelated
  mechanism.
- **Not RLS policies.** ADR-0007 already settled that app-level scoping is
  the boundary and RLS is an additive net for later. Composite FKs are an
  app-level-adjacent, database-enforced *write* constraint, not a read
  policy — orthogonal to that decision, not a step toward reopening it.
- **Not lifting the hard gate by itself.** This spec closes the largest
  remaining deferred item. The register still lists CRM keys, kiosk PIN and
  storage prefixing after this lands — see Further Notes.

## User Stories

1. As the organization-A operator of this system, I want a write that names
   organization B's employee, stock item, supplier, invoice, bank account, or
   any other cross-organization identifier to be rejected, so that my data
   cannot be silently corrupted by a bug or a malicious request in a sibling
   tenant's session.
2. As the developer converting the next legacy area, I want the database to
   reject an invalid cross-tenant reference regardless of which use case or
   service function constructs the write, so that correctness does not
   depend on every call site remembering to check.
3. As the developer reviewing spec B2's 14 embedded selects, I want to know
   whether each one still reads correctly once a cross-organization foreign
   key genuinely cannot exist, so that closing this gate item doesn't
   silently leave a read-side gap next to the write-side fix.
4. As the person who eventually provisions organization #2, I want the
   deferred register's largest item struck through with real evidence (a
   two-organization smoke on the local stack, mirroring ticket 21), so that
   "no second organization row" stops being blocked on this specific item.
5. As the on-call engineer during a production migration, I want the
   composite-index and composite-FK migrations to run without taking a
   long-held lock on tables that hold real data (`bank_movements`,
   `invoices`, `stock_movements`, `crm_customers`, …), so that this rollout
   is not an outage.
6. As a future reader of the deferred register, I want the "biggest item by
   volume" reduced to a ranked, audited list rather than a bare count of 65,
   so that a partial rollout (if one is ever needed) can be prioritized by
   actual risk instead of alphabetical table order.
7. As the developer running the query planner check, I want the composite
   index claim proven independently of the foreign key claim, so that a
   query-plan regression and a security regression are never the same test
   answering "yes" or "no" to both at once.
8. As the developer scoping phase 2, I want the two references that don't
   fit the mechanical pattern — `crm_customer_actions.created_by` (points at
   `auth.users`, which has no `org_id`) and `bank_movement_entity_links`'s
   polymorphic `(entity_type, entity_id)` pair (has no formal foreign key
   today, since it targets either `invoices` or `payable_entries` depending
   on `entity_type`) — named explicitly up front, so nobody discovers them
   mid-migration and improvises.

## Implementation Decisions

### D1 — An audit pass precedes both phases

65 referencing foreign keys and 96 existing indexes is too much to convert by
uniform rule without first checking each one actually fits it. The audit
pass is not a separate spec — it is this spec's own first increment, and its
output is a table, not a decision: for phase 2, every one of the 65
references, ranked by risk and user-facing-ness (an HR employee id reached
from an authenticated write endpoint ranks above a `dre_custos_fixos`
classification-rule reference nobody's UI ever supplies directly), plus a
flag for the two exceptions D1's own reading already found (see User Story
8); for phase 1, the actual `WHERE`/`ORDER BY` shapes the scoped query
helper's call sites produce today, checked against the 96 existing indexes,
because "add `org_id` to every index" is not the same claim as "add `org_id`
to the indexes queries actually use."

This spec records the ranking method and the two named exceptions; it does
not freeze the ranked table itself, since the audit is scoped as this spec's
first ticket, not repeated research here. See Further Notes for the concrete
starting inventory this spec's own reading already produced.

### D2 — Phase 1 (indexes) runs first, and phase 2 reuses its output

The ordering is not arbitrary sequencing — phase 2 structurally needs part of
what phase 1 builds. Every one of the ~22 distinct tables a composite FK will
reference needs a `UNIQUE (org_id, id)` constraint first (`locations` already
got exactly this in ADR-0009: `locations_org_id_id_key`). That unique
constraint **is** a composite `(org_id, …)` index. So phase 1's batch of
`CREATE UNIQUE INDEX CONCURRENTLY` statements covers both the pure
query-planner candidates *and* the FK-supporting ones in the same pass;
phase 2 then only has to attach each supporting index as a constraint
(`ADD CONSTRAINT … UNIQUE USING INDEX <name>`, which does not re-scan) before
adding the `NOT VALID` foreign key. Running phase 1 first also means the
lower-stakes, purely-additive half of this spec exercises the
outside-a-transaction migration mechanics (D3) before the phase carrying the
real behavioral change repeats them.

### D3 — Both phases use the same online technique; neither runs through the ordinary migration flow unmodified

`CREATE INDEX CONCURRENTLY` (and `CREATE UNIQUE INDEX CONCURRENTLY`) cannot
run inside a transaction block — Postgres rejects it outright. The Supabase
CLI applies each migration file as one transaction, so a plain migration
file containing a `CONCURRENTLY` statement fails outright, not slowly. This
repo has never run a `CONCURRENTLY` statement before (grep across
`supabase/migrations/` confirms zero prior uses), so this is a new deploy
shape, not an established pattern to copy.

Two ways to reconcile this, and the audit pass (D1) picks per-migration
which applies rather than this spec mandating one:

- A migration file whose statements are written so the CLI's transaction
  wrapping is disabled for it (the CLI supports this; confirm the exact
  mechanism against the installed CLI version before writing the migration,
  since this repo has no prior example to copy verbatim), or
- A deliberate manual run outside `supabase db push` — the statement executed
  directly against the target database, with the resulting schema state then
  captured into a migration file via `supabase db pull` / `db diff` so the
  repository's migration history stays the source of truth (ADR-0006's
  baselining discipline: no drift between the ledger and production).

Either way, phase 2's `NOT VALID` and `VALIDATE CONSTRAINT` statements *can*
run inside an ordinary transactional migration — only the `CONCURRENTLY`
index builds need the special handling. `VALIDATE CONSTRAINT` itself takes
only `SHARE UPDATE EXCLUSIVE` (ADR-0005, D8's citation), so it does not need
to dodge the transaction wrapper the way `CONCURRENTLY` does.

**Unlike ticket 21** (five small, low-volume tables, one organization, a
plain blocking `ADD CONSTRAINT` was fine because the validating scan was
instant), several of the ~65 references touch tables that have carried real
production data since day one — `bank_movements`, `invoices`, `stock_items`,
`stock_movements`, `crm_customers` among them. The online technique here is
load-bearing, not precautionary.

### D4 — Phase 1's candidate list is the scoped query helper's own call sites, not every existing index

An index gets `org_id` prepended only where the helper's query-construction
code actually filters or orders by both `org_id` and that column together —
matching D2 of ADR-0005's own reasoning that the helper is the one place
query shape is decided. Indexes that exist for a predicate nothing scopes by
organization (an internal `entity_type` discriminator, a `created_at`
ordering used only inside a single organization's own report) are left
alone; adding `org_id` to those buys nothing and doubles their storage cost
for free.

Concretely, from this spec's own reading of `supabase/migrations/`: 96
existing indexes, the large majority single-column, built against foreign-key
columns (`bank_movements_statement_idx`, `crm_contacts_customer_id_idx`,
`idx_hr_work_shifts_employee_date`, …) or status/date filters
(`cash_closings_status_idx`, `idx_invoices_reconciliation_status`, …) that the
helper's `org_id` predicate now always accompanies. One index is explicitly
excluded regardless of the audit's outcome:
`hr_employees_kiosk_pin_hash_uq`, because touching it is deferred item 5's
job (kiosk PIN), not this spec's.

### D5 — Phase 1's verification claim: the planner can choose the index, not that production chooses it today

"With one organization, `org_id` has one distinct value and buys the planner
nothing" (the deferred register's own reasoning) is still true the instant
after this migration runs, in production, where exactly one organization
exists. Waiting for a real second organization at real volume to prove the
planner picks the new index would block this spec on the very thing it's
gating (see D1's org-location-foundation precedent: the gate exists so a
second organization is *safe*, not so it already exists to test against).

So the proof runs on the local stack, the same way ticket 21's smoke did:
provision a second organization, load each affected table with enough rows
that organization membership has real selectivity (a handful of rows per
organization will not tip the planner regardless of which indexes exist —
this needs volume, not just a second distinct `org_id` value), then
`EXPLAIN (ANALYZE)` the query shapes D4 identified and confirm an index scan
or bitmap heap scan naming the new index, not a sequential scan. Where
seeding realistic volume locally is impractical for a given table, the
fallback is `EXPLAIN` with `SET LOCAL enable_seqscan = off`, which proves the
index is *usable* for the query shape even if the planner's cost estimate
wouldn't yet choose it unprompted at this data volume — a weaker but honest
substitute, and this spec records which tables needed the fallback rather
than treating it as full proof.

### D6 — Phase 2's target list: ~65 references, ~22 distinct target tables, minus two exceptions

This spec's own reading of `supabase/migrations/20260822141653_remote_schema.sql`
found 66 single-column foreign key constraints in the pre-tenancy baseline;
one (`app_users.id → auth.users.id`) no longer exists — `app_users` itself
was dropped in spec B1 (`20260825130000_drop_app_users.sql`) — leaving
**65**, matching D16's count exactly. Every table created since (the
location-credential and integration-credential tables from specs C/E) was
built with composite `(org_id, …)` foreign keys from day one, so this spec's
inventory is closed: nothing has been added to the legacy 65 since B2's
audit, and nothing new needs to be.

Two of the 65 do not fit `FOREIGN KEY (org_id, <col>) REFERENCES <target>
(org_id, id)` mechanically, and the audit pass (D1) should treat them as
named exceptions rather than force-fitting them:

- **`crm_customer_actions.created_by → auth.users.id`.** `auth.users` has no
  `org_id` column — a person's organization membership is many-to-many, held
  in `org_members`, exactly the reason ADR-0003/D3 gave for not putting a
  bare `org_id` on the user table in the first place. A composite FK against
  `auth.users` is not expressible the same way; this reference needs its own
  decision (application-level check that the referenced user is a member of
  the writing organization, or simply accepted as an audit-log field that
  does not need cross-tenant protection because it records *who acted*, not
  *what tenant data was touched*) rather than being counted toward the
  mechanical 63.
- **`bank_movement_entity_links.(entity_type, entity_id)`.** No formal
  foreign key exists today — `entity_type` discriminates between `invoice`
  and `payable_entry`, and Postgres cannot express "references `invoices` or
  `payable_entries` depending on a sibling column's value" as a single FK.
  ADR-0005 already named this table as one of the three reasons denormalized
  `org_id` (not FK-derivation) was chosen. Composite-ifying this reference
  means either two nullable composite FKs (one per possible target, exactly
  one populated per row, enforced by a `CHECK`) or leaving it as the one
  reference this spec's audit explicitly declines to close mechanically and
  hands to a follow-up decision. Either way, it is not silently absorbed into
  "the other 63."

### D7 — Composite FKs on CRM tables land in this spec; the CRM primary-key rework does not

`crm_customers`, `crm_tags`, `crm_parameters`, `crm_scripts` keep their
existing human-assigned text primary keys in this spec — restructuring those
is deferred item 4, and it explicitly depends on this spec landing first
(the children need to already resolve through composite keys before the
parent's key shape can change safely). A composite unique constraint works
identically regardless of the referenced column's type, so `crm_contacts`,
`crm_customer_actions`, `crm_customer_tags`, `crm_orders` get their composite
FKs to `crm_customers`/`crm_tags` in this spec exactly like every other
reference — this spec closes the caller-supplied-cross-tenant-reference hole
on CRM tables without touching the separate collision hazard that item 4
still owns.

### D8 — The 14 embedded selects get a review pass, not an automatic pass/fail

D16 established the mechanism precisely: an embedded select is not
organization-filtered on its own — it inherits safety from an
already-filtered parent plus the fact that no cross-organization foreign key
can exist in the data. Phase 2 removes the second half of that sentence.
That does not automatically make every embed unsafe; it makes each one worth
one look; a composite FK guarantees the *referenced row* belongs to the same
organization as the row that names it, which is precisely the property an
embedded select relies on to skip its own `org_id` predicate. Once the FK
exists, "the row was written before this migration, when a stale
cross-organization reference could still exist" is the only way an old row
could violate that property going forward — new rows are constrained at
write time.

So the review's job is narrower than re-auditing from scratch: confirm, per
embed, that (a) the FK phase actually covers the specific relationship that
embed follows, and (b) no row written before `VALIDATE CONSTRAINT` ran could
already hold a dangling cross-organization reference (impossible in
production today, since exactly one organization has ever existed — the
same reasoning D8 of the org-location-foundation spec used to guarantee
`VALIDATE CONSTRAINT` passes on the first try applies here for the same
reason). Where both hold, the embed needs no code change. Where an embed
follows one of D6's two named exceptions, it stays unsafe by the same
mechanism until that exception gets its own fix, and this spec's closing
increment says so explicitly rather than letting it read as closed by
omission.

### D9 — The proof is a two-organization smoke, matching ticket 21's shape, scaled to volume not to breadth

Repeating ticket 21's exact per-relationship exhaustive HTTP walk across all
65 references is not proportionate — that precedent covered 5 relationships
in one spec's own increment. This spec's smoke instead exercises:

- every distinct **target table** at least once (a cross-organization write
  against each of the ~22 targets, not each of the 65 referencing columns,
  since the constraint mechanism is identical across all children of the
  same target);
- the audit pass's (D1) highest-ranked, most user-facing subset in full,
  the same way ticket 21 covered all 5 of its relationships, because those
  are the ones an actual attacker or an actual bug is likeliest to reach
  through a real endpoint;
- direct-SQL insertion (not through an HTTP endpoint) for any reference with
  no caller-facing write path today, exactly as ticket 21 did for
  `cash_closings` (its endpoints never accept a caller-supplied location, so
  the FK was proven by inserting directly as `postgres`).

Each check confirms the same shape ticket 21 proved for locations: a
matching write with the caller's own organization's identifier succeeds; the
identical write with a sibling organization's identifier is rejected by a
named foreign-key-violation error, not by application code.

## Testing Decisions

**What makes a good test here** is unchanged from B2's own standard: pin
external, observable behavior, not implementation. The complication both
specs share is that the guarantee lives in the database schema, and the
existing suite structurally cannot see that — every test file uses fakes,
none constructs a real database client (spec A's D11 caveat, restated by
B2). Green unit tests after this migration are evidence that nothing else
moved, not that the migration is correct.

- **Phase 1 (indexes):** verified by `EXPLAIN (ANALYZE)` / `enable_seqscan`
  checks against the local stack per D5 — not a unit test, and not folded
  into phase 2's smoke, since "the planner can use it" and "the write is
  rejected" are different claims about different mechanisms (a b-tree index
  vs. a constraint) and a single check conflating them would misreport a
  failure in one as a failure in both.
- **Phase 2 (composite FKs):** verified by the two-organization smoke (D9),
  written up as a deliverable document exactly like ticket 21's, not
  automated into the Jest suite — pinning "a Postgres constraint exists and
  fires" through a fake output port would just be re-asserting the fake's own
  behavior.
- **The audit pass itself (D1)** produces a ranked table, not code; nothing
  to unit-test there beyond confirming the final ranked list accounts for
  all 65 references (a completeness check: every row from D6's inventory
  appears exactly once, including the two named exceptions).
- **Prior art:** ticket 21's smoke write-up
  (`.scratch/_done/scoped-access/issues/21-drop-defaults-composite-keys-and-smoke.md`,
  Comments section) is the template for phase 2's smoke — same two admin
  accounts, same "identifier belonging to the other organization" shape,
  same expectation that a `500`/`400` surfacing the exact constraint name
  counts as proof, an inconsistent HTTP status code does not.

## Out of Scope

- CRM primary-key restructuring (deferred item 4) — see D7.
- The kiosk PIN fix (deferred item 5) — its unique index is explicitly
  excluded from phase 1 (D4) and its own reasoning is untouched here.
- Storage path org-prefixing (deferred item 6) — unrelated mechanism.
- RLS policy authoring — ADR-0007's boundary decision stands.
- Fixing `bank_movement_entity_links`'s polymorphic reference or deciding
  `crm_customer_actions.created_by`'s treatment beyond naming them (D6) —
  both get their own small follow-up decision, not absorbed into this
  spec's mechanical pass.
- Running the two-organization smoke, or provisioning organization #2,
  against **production**. Exactly like ticket 21: this spec's smoke runs on
  the local stack only. It removes one more reason the gate exists; it does
  not lift the gate — the register (Further Notes) still has entries after
  this spec closes.
- Re-deriving the 14 embedded selects' original count or list from scratch —
  D8 works from B2's own audit, reviewing each in light of this spec's
  change rather than re-running B2's discovery process.

## Further Notes

### Deferred register, after this spec

**Confirmed closed, not just projected.** Ticket 07's two-organization
smoke (`issues/07-two-org-smoke.md`) found and fixed a real migration-ledger
bug — the four phase-2 files shared one migration-version timestamp, so a
clean `supabase db reset` silently dropped 3 of the 4 files' constraints
(64 of 82) — before confirming the row below. The fix (distinct timestamps
per file) is applied and merged; a fresh `db reset` now applies all four
files, and a targeted spot-check confirmed the cross-organization rejection
mechanism fires correctly across all three previously-broken files.

| Deferred | Status after this spec |
|---|---|
| The other 65 composite foreign keys | **Closed** (minus the two named exceptions in D6, which get their own follow-up) — verified per ticket 07 |
| Composite `(org_id, …)` indexes | **Closed**, scoped to the query shapes the helper actually produces (D4) |
| The 14 (17, on rediscovery) embedded selects | **Reviewed, all safe** — none depend on either named exception (ticket 07, `07-embedded-select-review.md`) |
| CRM text primary keys | Still open — this spec is its prerequisite, not its fix (D7) |
| Kiosk PIN collision across organizations | Still open, unchanged (deferred item 5) |
| Object-storage path prefixing | Still open, unchanged (deferred item 6) |
| Seed template data at provisioning | Still open, unchanged |

After this spec, the register's "before org #2" group is down to CRM keys,
kiosk PIN, storage prefixing and seed-template data — none of which is
mechanical in the way this spec's two items were, so none of them should be
assumed to fold into a follow-up of this same shape. **This does not lift
spec A's hard gate** — no second `organizations` row exists in production as
a result of this spec; the local stack's second organization used for
ticket 07's smoke was provisioned and torn down entirely on the local stack.

### Reference inventory (this spec's own audit, phase 2 starting point)

Distinct target tables and the number of referencing foreign keys found
against each, from `supabase/migrations/20260822141653_remote_schema.sql`
(65 total, current schema):

| Target table | Referencing FKs |
|---|---|
| `suppliers` | 7 |
| `cost_center_categories` | 7 |
| `cost_center_groups` | 6 |
| `stock_items` | 6 |
| `crm_customers` | 5 |
| `hr_employees` | 5 |
| `bank_accounts` | 3 |
| `invoices` | 3 |
| `pizzas` | 3 |
| `channels` | 2 |
| `cost_centers` | 2 |
| `preparations` | 2 |
| `supplier_invoice_imports` | 2 (one self-referencing) |
| `banks`, `bank_movements`, `bank_statement_imports`, `crm_action_types`, `crm_contacts`, `crm_tags`, `hr_work_shifts`, `pizza_recipes`, `recurring_contracts`, `payable_entries`, `stock_categories` | 1 each |
| `auth.users` | 1 (`crm_customer_actions.created_by` — named exception, D6) |

`crm_customers` also self-references (`referred_by`), same treatment as any
other reference to it.

This is a starting inventory for the audit pass (D1), not a substitute for
it — the audit still has to rank these by risk and user-facing-ness, and
confirm no reference introduced between this reading and implementation
changes the count.

### Risks

| Risk | Mitigation |
|---|---|
| A `CONCURRENTLY` index build is attempted inside the CLI's normal transactional migration flow and fails outright | D3 — resolve the exact disabled-transaction mechanism against the installed Supabase CLI version before writing the migration; this repo has no prior example |
| `VALIDATE CONSTRAINT` on a large production table (`bank_movements`, `invoices`) takes an unexpectedly long `SHARE UPDATE EXCLUSIVE` hold | Check table sizes before running against production, exactly as ticket 21's runbook did for the five location tables — this spec's tables are more numerous and some are larger |
| The audit pass under-ranks a reference that later turns out to be reachable from an authenticated write endpoint nobody flagged | D9's smoke exercises every distinct target table at minimum, not only the ranked subset, so a missed ranking is still caught by the target-table sweep |
| An embedded select depends on one of D6's two named exceptions and gets marked reviewed-and-safe by mistake | D8 requires the review to name which relationship each embed follows and check it against D6's exception list explicitly, not just "does this embed still return correctly" |
| This spec is read as lifting the hard gate | Explicitly not — see Out of Scope and the Deferred register above |
