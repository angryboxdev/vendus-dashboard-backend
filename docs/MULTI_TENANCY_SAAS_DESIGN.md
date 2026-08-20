# Multi-tenancy & White-label — Análise de Arquitetura

> Status: em discussão — Variant A escolhida (linha core/plugin fechada em §3);
> decisões 2, 4 e 6 fechadas (§6); 3, 5 e 7 ainda abertas;
> nenhuma decisão implementada
> Última atualização: 2026-08-20
> Nota: escrito em inglês por pedido; traduzir se for para o padrão do repo.

---

## Purpose

Angry Box Hub was built for a single business (Angrybox). This document analyses
what it would take to turn it into a white-label / multi-tenant SaaS, and lays out
the two product directions that lead to materially different architectures.

Nothing here is decided. The open decisions are listed at the end.

---

## 1. Current state (audit)

| Signal | Reality |
|---|---|
| Tables | 46 across 72 migrations — **zero** have a tenant column |
| Auth | Supabase JWT via JWKS, `app_role` claim injected by `custom_access_token_hook`, fallback lookup in `app_users` |
| RLS | Enabled in 15 migrations, but policies are `"Allow read for anon"` — decorative |
| DB access | 72 call sites use `getSupabaseServiceRole()` (bypasses RLS) vs 31 on the anon client |
| Vendus integration | `src/infra/vendusClient.ts` reads one global `ENV.API_KEY` |
| Company identity | Hardcoded in `src/config/company.ts` |
| Vertical coupling | 35 files touch pizza/Angrybox concepts (`pizzas`, `pizza_recipes`, `preparations`) |

The business logic is largely generic (cash closings, bank reconciliation, supplier
invoices, HR, DRE). The pizzeria-specific part is a thin, contained slice.

### 1.1 Why `getSupabaseServiceRole` exists (and why it spread)

It was not arbitrary. Migrations `028_hr_angrybox`, `032_hr_shift_attendance` and
`035_app_users` do this:

```sql
alter table public.hr_employees enable row level security;
-- ...and never create a policy
```

RLS enabled with **zero policies** means deny-everything in Postgres. That was a
deliberate privacy lock: salary and employee data must be unreachable with the anon
key the browser holds. The service role was the only key that fits — hence the
comment *"usar só no servidor para módulo RH"* in `src/infra/supabaseClient.ts`.

Every other table got `"Allow read for anon"` — wide open — so those modules *could*
have used the anon client. The service role leaked into them anyway (7 modules +
16 files in `src/services`), which erased the distinction.

**Takeaway:** the HR pattern is the correct baseline for the whole schema. Deny by
default, then add real policies keyed on `org_id`. The rest of the schema is the
anomaly, not HR.

---

## 2. Tenancy model

### 2.1 Terminology

- **Tenant** is a *role*, not an entity — the architectural term for the boundary
  isolation is enforced on.
- **Organization** is the concrete entity in the schema that plays that role.

They are the same thing here: `org_id` **is** the tenant id.

### 2.2 Two levels: organization and location

|  | Organization (= tenant) | Location |
|---|---|---|
| What it is | The customer; the contract signed | A physical store / operating unit |
| Boundary for | Data isolation, billing, plan, users, integration credentials | Cash drawer, register, shift, stock, daily closing |
| Angrybox today | 1 | 1 |
| Second customer | 1 | possibly 3 |

`org_id` goes on every table (isolation). `location_id` goes only on operational
tables (`cash_closings`, `stock_movements`, `hr_work_shifts`, invoices) where
"which store" is a real question.

Modelling both now matters because retrofitting a second level later means touching
all 46 tables twice.

**Decided: `location` ships in v1** — real rows, not a single placeholder row per
org. Operational tables get `location_id NOT NULL` in the same pass as `org_id`
(phase 3), and the read/write paths are location-aware from the start: a closing
belongs to a store, a stock movement happens at a store, reports can filter by
store. Angrybox stays at one location, which makes the v1 UX trivial there, but the
three-store customer is then an onboarding task and not a migration.

### 2.3 Organization = legal entity (one NIF)

Recommended: the organization boundary is the **legal entity**.

Reason is concrete and already in the code — `COMPANY.nif` in `src/config/company.ts`,
plus invoicing, DRE and the Vendus integration. In Portugal each NIF invoices
separately and files its own accounts; `dre_receita_bruta` or supplier invoices can
never be mixed across two NIFs. The legal entity is a hard accounting boundary, so
it is the natural isolation boundary.

**Franchise case:** a franchisor with 8 franchisees (8 NIFs) wanting consolidated
reporting should be handled later as a *read-only overlay* — a `group_id` on orgs
plus cross-org aggregate queries for group admins — not as a third isolation level.
Far cheaper than a second `org_id`-style column across the schema.

### 2.4 Storage model: shared DB, row-level `org_id`

Not schema-per-tenant, not DB-per-tenant. With 46 tables and 72 migrations,
per-tenant schemas means running every migration N times and fighting the Supabase
setup. Shared DB with a mandatory `org_id` is right until a customer contract
demands physical isolation.

### 2.5 How tenant context flows

Explicitly, in the use case input DTO — **not** via `AsyncLocalStorage` or a global.

```
HTTP:  req.auth.org_id  →  controller  →  use case input DTO  →  port method
Cron:  for each org     →  use case input DTO  →  port method
```

The decisive argument is the cron jobs. `runDailyVendusConsumption` has no request
context. With implicit context every job must be manually wrapped; with an explicit
`orgId` in the input type, the compiler forces it at every call site.

`org_id` is a domain concept ("whose data is this"), so it living in `domain/` is
correct under CLAUDE.md's dependency rules — it is not an infra leak.

### 2.6 Enforcement: defence in depth

RLS alone will not save us — 72 call sites use the service role and bypass it.

1. **A scoped query helper** that cannot be constructed without an `orgId`. Every
   out-adapter goes through it; raw `.from()` banned outside it, enforced by
   `dependency-cruiser` (already a dependency) or a grep test.
2. **Real RLS policies** as the backstop, using an `org_id` claim in the JWT — added
   in the same `custom_access_token_hook` that already injects `app_role`.
3. **Storage paths** prefixed by org for HR documents and invoice PDFs.

---

## 3. The product fork: two design variants

The core/plugin line depends on which product this is. The two options lead to
different schemas, not just different marketing.

### Variant A — Restaurant vertical

The product is "back-office for restaurants." Core is allowed to have restaurant
opinions.

**The rule that draws the line:** core owns the *concept* and the *normalized
shape*; a plugin owns the *wire format*. It is applied three times below (recipes,
channels, POS) and gives the same answer each time — which is the sign the seam is
real and not three ad-hoc calls.

**The test for a single table or column:** is it a row or a column? "Pizza" is a
row in `products`. "Recipe-awareness" is a column — structure every restaurant
needs. Rows are tenant data; columns are core schema. Anything that would force a
schema migration to onboard a non-pizzeria restaurant is currently in the wrong
place.

#### 3.1 Recipes, products and stock — core, once de-pizza-fied

Core is recipe-aware: selling a product consumes ingredients. What must *not* stay
is the pizzeria shape of the current tables.

The vertical leak is not the word "pizza". `preparations` (`026_preparations.sql`)
is already generic — `yield_qty`, `yield_unit`, `use_as_unit`, items pointing at
`stock_items` — and moves to core with a rename at most. The real leak is two
Postgres enums:

- `pizza_size AS ENUM ('small','large')` — baked into `pizza_recipe_items`
  (`unique (recipe_id, stock_item_id, size)`) **and** `pizza_prices`
  (`unique (pizza_id, size)`). That is a hardcoded two-value variant axis. A burger
  shop has no sizes; a café has three; a sushi place varies by piece count.
- `pizza_category AS ENUM ('classics','specials','sweeties')` — a per-org lookup
  table, not a database enum.

Core shape after generalization:

```
products → product_variants → recipes (versioned) → recipe_items → stock_items
                                                   ↘ preparations → preparation_items
```

`product_variants` is one row per sellable SKU; `recipe_items` and prices key on
`variant_id` instead of a size enum. `waste_factor` and `is_optional` stay as they
are. Product category becomes a per-org table.

Result: "pizza" is data in one tenant's `products` table, not schema.

#### 3.2 Channels — core; platform-specific logic is not

`069_channels.sql` is already the right shape: `code`, `name`, `sort_order`,
`is_active` — a generic lookup seeded with Angrybox's 7 rows. Under multi-tenancy
that seed becomes an **org template**, and the deterministic `80000000-…` ids stop
being global (relevant to phase 3: `channels` gets `org_id`).

What core still needs, or "revenue by channel" is a label with no math behind it:
generic **economic attributes** on the channel — `type`
(`dine_in | takeaway | own_delivery | marketplace`), `commission_rate`, and
`settlement` (`immediate | payout`). These are true of any aggregator, not of Glovo
specifically, and they are what lets the DRE compute net-of-commission margin.

What the connector owns: fetching orders, parsing the payout/settlement file,
mapping their menu ids to core products, their specific commission tiers. A
connector produces rows that *reference* a core channel; it never defines what a
channel is.

#### 3.3 The sales ledger — core; POS connectors — plugins

The most consequential item, and the one currently missing from the schema.

Today there is **no system of record for revenue in this database**. It is rented
from Vendus over HTTP on every read:

- `dreReceitaBrutaService.ts` → `fetchAllDocuments()` → Vendus API on every DRE render
- `/vendus/summary`, KPIs, channel/category/VAT breakdowns → live API calls
- `analytics_monthly_cache` (`045`) caches computed output, not sales
- `cash-closings` fetches the Vendus session total at submit time and persists only
  that scalar as a reference value

So Vendus is the system of record and we rent it back. That coupling is deeper than
the 35 files that mention pizza.

**Core owns a sales ledger:** `sales_documents` / `sales_lines` — date plus service
day, channel, product/variant, quantity, gross, VAT, payment method, credit-note
linkage, and a `granularity` marker (see open decision 5). Everything downstream —
DRE, cash closing comparison, food cost, channel margin, stock depletion — reads
only this.

**Core owns the output port** (`SalesSourcePort` / `PosGateway`). `vendus`, later
`zettle`/`square`, are out-adapters that fill the ledger. **Manual daily-total entry
is a core-provided implementation of the same port** — a tenant with no supported
POS can still use the product, which is the cheap onboarding wedge. **Decided: it
ships in v1**, alongside the ledger (phase 8). It is the proof that the ledger's
port really is source-agnostic: if manual entry is awkward to express through
`SalesSourcePort`, the port is wrong, and better to learn that with the first
connector still in hand.

**Ledger ≠ cash closing.** The ledger is what the POS recorded: line-level,
product-level, many rows per shift. The closing is what the human declared and
counted: money-level, one row per shift, plus drawer count and approval state. They
stay separate and reference each other — the difference between them is the entire
point of the manager's shift review.

`vendus_product_mapping` (`013`) is the seam artifact: external product id →
`pizza_id` + `pizza_size` today, → `variant_id` after §3.1. It belongs to the
connector and is keyed per connector.

**Consequence for the code:** `src/modules/vendus` splits in two. It is currently
both an HTTP client and the only place sales exist as a concept. Analytics, KPI and
summary use cases move up into a core `sales` module; `vendus` keeps the client, the
DTO mapping and the credential. This split is what makes customer #2 possible at
all — a pizzeria on Zettle instead of Vendus must not lose the DRE.

#### 3.4 Service day

Cash closing keeps a **service day** (closes ~2am), not a calendar day — already hit
with the cross-day credit-note fix (commit `3ab9793`). The ledger stores both the
document timestamp and the service day it belongs to.

#### 3.5 What stays a plugin

Only **integration adapters**: POS connectors (Vendus, later Zettle/Square), delivery
aggregators (AirMenu), bank connectors, KDS. **One extension axis.** Nothing in that
list defines a domain concept; each one fills a core-owned shape.

### Variant B — Horizontal SMB back-office

The product is "financial back-office for any business." Core must be domain-neutral.

- Recipes, preparations, KDS and channels move into a **restaurant vertical pack**.
  Two extension axes: vertical packs **and** integrations.
- Core stock becomes generic inventory with no BOM — the recipe engine cannot live
  there.
- Requires **configurable taxonomy**: per-tenant chart of accounts, cost-center
  trees, custom fields (JSONB).
- Cash closing becomes generic "till reconciliation" with a configurable day boundary.
- Domain entities get thinner — more `Record<string, unknown>` and type
  discriminators, less real business logic. This fights the hexagonal design.

### Trade-offs

|  | A — Restaurant | B — Horizontal |
|---|---|---|
| Extension axes | 1 (integrations) | 2 (vertical packs + integrations) |
| Core domain richness | Deep, opinionated | Thin, configurable |
| Work that serves Angrybox | ~all of it | ~60% |
| Onboarding a new customer | Low — looks like Angrybox; templates work | High — taxonomy config per customer |
| Competes with | Restaurant-ops tools (few in PT) | Accounting software + Excel (entrenched) |
| Pricing story | Outcome-based: "food cost per pizza" | Feature-based, commoditized |
| Time to second customer | Fast — another pizzeria | Slow — first non-restaurant needs new abstractions |
| Ceiling | Smaller TAM | Larger TAM, harder to reach |
| Failure mode | Niche too small | Generic enough that nobody switches |

### Recommendation: A, with a disciplined seam

1. **Direction of travel is one-way.** Vertical → horizontal is well-trodden (Toast,
   Shopify, Procore). Horizontal → vertical is much harder: a generic system has
   surrendered its right to have opinions, and un-generalizing breaks every existing
   tenant. Choosing A keeps B reachable; choosing B closes A.

2. **The moat is integration + locality, not the accounting.** (Not to be confused
   with the *sales ledger* of §3.3, which is core.) Bank reconciliation and
   payables are well-built here but commoditized. What is hard to copy is a
   Portuguese back-office that speaks Vendus, AirMenu and Portuguese fiscal rules
   (NIF, credit notes, SAF-T-shaped invoicing).

3. **Variant B costs work Angrybox never uses.** Per-tenant chart of accounts and
   custom fields are weeks of engineering with zero benefit to the only current
   customer — and they are exactly the abstractions that make the domain anemic.

**The seam that keeps B alive:** keep `financial-base`, `bank-accounts`,
`bank-statements` and `payable-entries` free of restaurant vocabulary. No `pizza`,
no `service`, no `channel` in those modules' domain layers — they talk about money,
entities and documents. Everything restaurant-flavoured lives above them. Cheap to
maintain, roughly where the module boundaries already sit, and enforceable with a
`dependency-cruiser` rule.

### Note on the split proposed in the notes

The split written down so far — core = cash closing, bank statements, payables,
financial base, invoices, HR; plugins = pizzas, recipes, Vendus, AirMenu — **is
Variant B's split.** It puts recipes and channels outside the core, which means the
core can never reason about food cost or channel margin, and it leaves core without
any revenue data at all.

Under Variant A the line moves as set out in §3.1–§3.5: `vendus` and `air-menu` are
plugins (integration adapters — correct), but products, recipes, stock, channels and
the **sales ledger** are core. Only the *connectors* are pluggable, not the domain.

This was the single most consequential line to draw. It is now drawn — §3.1–§3.5 is
the answer, and phase 3 can proceed against it.

---

## 4. Per-tenant configuration

Replaces environment variables and hardcoded config:

- `ENV.API_KEY` (Vendus) → output port `IntegrationCredentialsPort.vendusFor(orgId)`,
  backed by an encrypted per-org table.
- `src/config/company.ts` (name, NIF, address, email) → `org_settings`.
- Branding, plan and feature flags → `org_settings`.

---

## 5. Suggested phasing

| Phase | Work | Risk | Spec |
|---|---|---|---|
| 0 | Settle core-vs-plugin line (Variant A or B) — **done, §3** | Design only | — |
| 1 | Company profile table — replaces `config/company.ts` | Low, independent | A |
| 2 | Auth + RLS review; deny-by-default baseline | Low, independent | audit → A, policies → B |
| 3 | Add `org_id` to all 46 tables and `location_id` to the operational ones, backfill Angrybox, then `NOT NULL` + composite indexes | Mechanical, big | A |
| 4 | `org_id` claim in JWT hook + `AuthPayload`; membership table with org-scoped roles | Medium | B |
| 5 | Scoped query helper + migrate adapters module by module (start with `cash-closings`, already hexagonal) | Steady | B |
| 6 | Per-org credentials & settings; remove `config/company.ts` and `ENV.API_KEY` | Medium | C |
| 7 | Crons fan out per org | Small, easy to get wrong | C |
| 8 | Sales ledger: `sales_documents`/`sales_lines` + `SalesSourcePort`; move analytics out of `vendus`; manual-entry adapter (v1 scope) | Medium, unblocks POS #2 | D |
| 9 | De-pizza-fy: `product_variants`, per-org category table, rename recipes/preparations; migrate `vendus_product_mapping` to `variant_id` | Mechanical, touches 35 files | D |
| 10 | Channel economic attributes (`type`, `commission_rate`, `settlement`) | Small | D |
| 11 | Vertical/plugin extraction, onboarding & provisioning, billing | Product work | later, several |

Phases 1 and 2 are safe to do now — they do not depend on the variant decision.

Phase 3 is the point of no return: do it before the schema grows more tables, and
align it with the existing legacy→hexagonal migration so each module is touched once
instead of twice.

Phases 8–10 are the Variant A core work. Ordering note: **9 before 8 if they land
close together** — the ledger's `sales_lines` should point at `variant_id`, not at
`pizza_id` + `pizza_size`, or the mapping table gets migrated twice. If the ledger is
urgent, ship 8 against the current pizza keys and accept one extra migration.

### 5.1 How this maps to specs

A phase is a unit of *sequencing*. A spec should be a unit of *verification* —
something that can be tested as done and that leaves the system deployable. Several
phases fail that test alone: phase 3 by itself adds columns nothing reads, and phase
10 is three columns. So the phases group into four specs rather than eleven, and
phase 11 is not one piece of work at all.

| Spec | Phases | Done means | Needs first |
|---|---|---|---|
| **A — Org & location foundation** | 1, 3 (+ phase 2's audit) | No table lacks `org_id`; operational tables carry `location_id`; Angrybox backfilled; app behaves identically | — |
| **B — Isolation & auth** | 2 (policies), 4, 5 | A user of org A provably cannot read org B, through both RLS and the scoped helper | Open decision 3 |
| **C — Per-org configuration** | 6, 7 | `config/company.ts` and `ENV.API_KEY` are deleted; crons run per org | A, B |
| **D — Sales ledger** | 9, then 8, with 10 folded in | Core owns revenue: DRE and analytics read the ledger, not the Vendus API | Open decision 5 (and 7) |

Three notes on why the grouping is not simply "one spec per phase":

- **A and B are split even though both are 'multi-tenancy'.** A is mechanical and
  reviewable in bulk; B is where the security argument lives and needs careful
  acceptance criteria. Different review posture, so different spec.
- **Phase 2 straddles them.** Its audit half — what the 15 RLS migrations actually
  do, how far the service role has spread — runs first and is what settles open
  decision 3. Its implementation half cannot land until `org_id` exists, because the
  policies key on it. Audit in A, policies in B.
- **Phase 10 folds into D** rather than standing alone: it is three columns on
  `channels`, a table spec D already touches.

**Write one spec at a time, just ahead of the work.** Specs B and D are exactly the
ones open decisions 3, 5 and 7 reshape; writing all four now means writing two of
them against unmade decisions and rewriting them later.

This document stays the standing architecture reference. Specs point here for the
*why* and carry only the *what* and the acceptance criteria — duplicating the
rationale into a spec forks it, and then one of the two copies rots.

---

## 6. Open decisions

Decided items are struck through and kept for the record; the reasoning stays where
it belongs (§2–§3) and is only summarized here.

1. ~~**Variant A or B**~~ — **decided: A**, with the seam described in §3 and the
   `financial-base`/`bank-*`/`payable-entries` modules kept free of restaurant
   vocabulary. Core = concept + normalized shape; plugin = wire format.
2. ~~**Is `location` needed in v1**~~ — **decided: yes, real in v1** (§2.2).
   `location_id` lands with `org_id` in phase 3 on the operational tables, and the
   use cases are location-aware from day one rather than assuming one row per org.
   Consequence: every operational use case input DTO carries `locationId` next to
   `orgId`, and "which store" becomes a filter in cash closings, stock and reports.
3. **Does RLS become the real boundary**, or does app-level scoping carry it with RLS
   as backstop only? — **still open**, to be decided after digging into the actual
   policy surface. Blocks nothing up to phase 4, but it forks phase 5: the scoped
   query helper is worth building under either answer, yet *what it wraps* differs.
   If RLS is the real boundary the helper wraps a per-request client carrying the
   user's JWT and the 72 service-role call sites convert; if RLS is a backstop the
   helper keeps the service role and only makes `orgId` structurally unavoidable.
   Since phase 5 migrates adapters module by module, deciding this midway means
   re-migrating the modules already moved. Decide it before `cash-closings` (the
   first module) goes through — phase 2 will by then have shown how much real policy
   surface exists.
4. ~~**Are roles org-scoped?**~~ — **decided: yes, the role model changes** (§2.6,
   phase 4). A role is no longer a global property of a user: it is a property of the
   pair (user, org), so the model becomes a membership — `org_members (org_id,
   user_id, role)` — and the same person can be `admin` in one org and nothing in
   another. `custom_access_token_hook` stops injecting a bare `app_role` and injects
   the org plus the role held *in that org*; `AuthPayload` follows.
   **Still to design:** the role set itself. `admin | manager | hr_viewer` was already
   flagged as "not great", and org-scoping is orthogonal to fixing it — the scoping
   decision is made, the taxonomy is not.
5. **Ledger granularity** — does the ledger store fiscal documents, or aggregates?
   Vendus gives documents; a future connector may give only daily totals. Storing
   documents and deriving aggregates is more faithful but forces every connector to
   produce documents. Leaning: store documents with a `granularity` marker so a
   daily-total source is a first-class, if coarse, citizen. **Still open** — needs a
   pass over what the DRE and food-cost use cases actually read before committing.
   Note decision 6 raises the stakes: manual entry in v1 means a coarse source exists
   on day one, so the `granularity` marker is likely unavoidable.
6. ~~**Does manual sales entry ship in v1?**~~ — **decided: yes** (§3.3). It ships
   with the ledger in phase 8, as a core implementation of `SalesSourcePort`, not as a
   side door that writes to the ledger directly.
7. **Do channel economic attributes ship with the ledger or later?** Without them the
   DRE shows gross revenue by channel but not margin by channel. **Still open.**
   Phase 10 is small and additive (three columns on `channels`), so deferring it costs
   little as long as the ledger keeps the `channel_id` reference — that reference is
   the part that would be expensive to backfill later.

### Remaining before implementation

3, 5 and 7 are the ones still to settle. None of them blocks phases 1–4: the
company profile table, the RLS deny-by-default baseline, the `org_id`/`location_id`
schema pass and the auth/membership rework are all independent of the three.

Deadlines, in order: **3 before phase 5's first module** (i.e. before spec B is
written), 5 before phase 8 and 7 before phase 10 (both inside spec D; 7 stays cheap
even after, as long as the ledger carries `channel_id`). See §5.1 for the specs.

Not tracked as an open decision but needed before phase 3 starts: **the order in
which the 46 tables and their modules get touched**, aligned with the existing
legacy→hexagonal migration so each module is opened once rather than twice.

---

## 7. Related

- `CLAUDE.md` — architecture rules (hexagonal, ports & adapters, module docs)
- `src/modules/tasks` — reference module for the new pattern
- `docs/FINANCIAL_SYSTEM_PLAN.md` — financial system roadmap
