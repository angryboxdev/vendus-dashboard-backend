# Module: sales-summary

> Status: active
> Last updated: 2026-09-06

---

## What it is and what it's for (business perspective)

The manager has no single consolidated view of monthly revenue. Vendus covers
in-person channels (Salão, Take Away, Eatz); AirMenu covers delivery platforms
(Uber Eats, Glovo, Bolt Food). Getting a complete picture requires visiting two
pages, applying filters manually, and adding up numbers by hand.

**The problem it solves:**
No cross-source view of monthly revenue, channel performance, product ranking,
or growth trend.

**The flow from the business's point of view:**

```
Manager
──────────────────────────────────────────
1. Opens /results (month selector defaults to current month)
2. Sees KPIs: Receita Bruta, Faturado Total, Cancelamentos,
   IVA, Receita Líquida, N.º transações, Ticket Médio
3. Sees channel breakdown (Salão, Take Away, Eatz, UberEats,
   Glovo, Bolt Food) with share %
4. Sees category breakdown and top-products ranking
5. Clicks "Actualizar" to force-refresh from live APIs
6. Navigates to other months via month picker or chart bars
```

**Key concepts for the business:**

- **Sales Period** — a calendar month (year + month pair). Only complete
  months are supported; no free date ranges (ADR-0010).
- **Receita Bruta** — total invoices minus credit notes, with VAT.
- **Faturado Total** — total invoices before NC subtraction.
- **Unified Channel** — one of: salao, take_away, eatz, uber_eats, glovo,
  bolt_food. Legacy `apps` appears only for pre-AirMenu periods.
- **Unified Category** — Pizzas, Bebidas Alcoólicas, Bebidas, Outros.

---

## Technical purpose

Consolidates Vendus and AirMenu revenue data for a calendar month into a single
`SalesSummaryResult`, cached in Supabase. Serves three HTTP endpoints:
GET (cached/live), POST refresh (force live), GET growth chart (12-month series).

Not responsible for the detail pages of either source module, DRE/cost data,
or employee self-consumption.

## Domain concepts

- **SalesSummaryResult** — immutable value computed by the calculator; always
  passes through cache (every result has a `cachedAt`).
- **SalesSummaryCalculatorService** — pure function merging VendusSummaryData +
  AirMenuSummaryData. All merging logic lives here (channel union, category
  mapping, product deduplication by normalized title, temporal bucket merge).
- **Cache TTL** — 15 minutes for the current month; past months have no TTL
  (immutable once computed unless force-refreshed).

## Ports

### Input (use cases)

- `GetSalesSummaryPort` — checks cache, calls sources in parallel if needed,
  runs calculator, saves to cache. Accepts `forceRefresh: boolean`.
- `GetGrowthChartPort` — returns 12 `MonthlyGrowthPoint[]` for a year;
  computes missing past months sequentially (known slow path — ADR-0013).

### Output (domain dependencies)

- `VendusSummaryPort` — fetches Vendus data for a month (grossRevenue, VAT,
  channels, categories, products, hourly temporal).
- `AirMenuSummaryPort` — same shape for AirMenu platforms.
- `SalesSummaryCachePort` — `get`, `save`, `getYearMonths`; organizationId
  is always the first parameter (D2 pattern).

## Adapters

### Input

- `SalesSummaryController` → exposes use cases via REST at:
  - `GET /api/sales-summary?year=&month=`
  - `POST /api/sales-summary/refresh?year=&month=`
  - `GET /api/sales-summary/growth?year=`

### Output

- `VendusSummaryAdapter` → bridges vendus module's `GetSummaryPort` →
  `VendusSummaryPort`. Separates take_away from salao; computes hourly
  temporal from documents' system_time.
- `AirMenuSummaryAdapter` → bridges air-menu module's `GetSummaryPort` →
  `AirMenuSummaryPort`. Normalizes product titles for cross-source
  deduplication. Controlled by `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID`.
- `SupabaseSalesSummaryCacheAdapter` → implements `SalesSummaryCachePort`
  using `ScopedQueryFactory` (D2) on the `sales_summary_cache` table.

## Design decisions (ADR summary)

- **ADR-0010** — Sales Period is a calendar month, not a free date range.
  Fixed boundaries are required by the cache strategy (UNIQUE on org+year+month)
  and unambiguous comparison period.
- **ADR-0011** — AirMenu "Drinks" → "Bebidas" is a known approximation. No
  per-PLU alcohol classification. Do not "fix" without a spec change.
- **ADR-0012** — Scope is Angry Box main enterprise only; Porto excluded.
  Controlled by `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID`.
- **ADR-0013** — Growth chart triggers on-demand calculation for missing months.
  This is a known cold-start slow path. `POST /refresh` is the pre-warm
  mechanism. A background cron on the 1st of each month is the documented
  next step (out of scope for this iteration).
- The three denormalized columns (`total_revenue_cents`, `vendus_revenue_cents`,
  `air_menu_revenue_cents`) exist so `getYearMonths` avoids deserializing 12
  JSON blobs per growth chart request.

## How to test

- Domain/use cases: `npx jest src/modules/sales-summary` (fast, fakes only).
- Adapters: integration tests not included in this iteration (see Known gaps).

## Known gaps / open debt

- **Cold-start growth chart** — first load of a year with no cached months
  triggers sequential calculation of all past months. Expensive. Pre-warm via
  `POST /refresh` is the current mitigation; a background cron on the 1st of
  each month is the documented next step (ADR-0013).
- **AirMenu Drinks → Bebidas approximation** — Drinks includes both alcoholic
  and non-alcoholic AirMenu items. Splitting requires per-PLU classification
  (ADR-0011).
- **Vendus VAT approximation** — `invoiceVatCollectedCents` comes from the
  analytics on filtered docs (same-period cancelled pairs excluded). This means
  VAT on same-period NC is not subtracted. Acceptable for MVP.
- **Timezone** — hourly temporal uses `getHours()` without explicit Lisbon
  offset. Correct when server runs in Europe/Lisbon; approximation otherwise.
- No integration tests for the Supabase cache adapter.
