# Multi-tenancy & White-label — Análise de Arquitetura

> Status: em discussão — nenhuma decisão implementada
> Última atualização: 2026-08-18
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

- `channels` (Glovo/UberEats/Bolt) is a **core concept**, not a plugin. Revenue by
  channel is a first-class dimension in the DRE.
- Stock is **recipe-aware in core**: selling a pizza consumes flour.
  `pizza_recipes`/`preparations` generalize to BOM / technical sheets, in core.
- Cash closing keeps a **service day** (closes ~2am), not a calendar day — already
  hit with the cross-day credit-note fix (commit `3ab9793`).
- Plugins are only **integration adapters**: POS connectors (Vendus, later
  Zettle/Square), delivery aggregators (AirMenu), bank connectors, KDS.
  **One extension axis.**

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

2. **The moat is integration + locality, not the ledger.** Bank reconciliation and
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
core can never reason about food cost or channel margin.

Under Variant A the line moves: `vendus` and `air-menu` are plugins (integration
adapters — correct), but recipes, stock and channels are **core**. Only the
*connectors* are pluggable, not the domain.

This is the single most consequential line to draw, and it should be settled before
the `org_id` migration.

---

## 4. Per-tenant configuration

Replaces environment variables and hardcoded config:

- `ENV.API_KEY` (Vendus) → output port `IntegrationCredentialsPort.vendusFor(orgId)`,
  backed by an encrypted per-org table.
- `src/config/company.ts` (name, NIF, address, email) → `org_settings`.
- Branding, plan and feature flags → `org_settings`.

---

## 5. Suggested phasing

| Phase | Work | Risk |
|---|---|---|
| 0 | Settle core-vs-plugin line (Variant A or B) | Design only |
| 1 | Company profile table — replaces `config/company.ts` | Low, independent |
| 2 | Auth + RLS review; deny-by-default baseline | Low, independent |
| 3 | Add `org_id`/`location_id` to all 46 tables, backfill Angrybox, then `NOT NULL` + composite indexes | Mechanical, big |
| 4 | `org_id` claim in JWT hook + `AuthPayload` | Small |
| 5 | Scoped query helper + migrate adapters module by module (start with `cash-closings`, already hexagonal) | Steady |
| 6 | Per-org credentials & settings; remove `config/company.ts` and `ENV.API_KEY` | Medium |
| 7 | Crons fan out per org | Small, easy to get wrong |
| 8 | Vertical/plugin extraction, onboarding & provisioning, billing | Product work |

Phases 1 and 2 are safe to do now — they do not depend on the variant decision.

Phase 3 is the point of no return: do it before the schema grows more tables, and
align it with the existing legacy→hexagonal migration so each module is touched once
instead of twice.

---

## 6. Open decisions

1. **Variant A or B** — determines what lives in core. Blocks phase 3.
2. **Is `location` needed in v1**, or just modelled and left at one row per org?
3. **Does RLS become the real boundary**, or does app-level scoping carry it with RLS
   as backstop only?
4. **Auth and role model review** — current roles are `admin | manager | hr_viewer`,
   flagged as "not great". Roles will need to become org-scoped regardless of variant.

---

## 7. Related

- `CLAUDE.md` — architecture rules (hexagonal, ports & adapters, module docs)
- `src/modules/tasks` — reference module for the new pattern
- `docs/FINANCIAL_SYSTEM_PLAN.md` — financial system roadmap
