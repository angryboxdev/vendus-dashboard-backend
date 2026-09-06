# Spec: Sales Summary — Página de Resultados Consolidados

> Feature slug: `sales-summary`
> Status: ready-for-agent

---

## Problem Statement

The manager has no single place to see consolidated revenue for the business.
Vendus covers in-person channels (Salão, Take Away, Eatz); AirMenu covers
delivery platforms (Uber Eats, Glovo, Bolt Food). To get a complete picture
of a month's performance the manager must visit two separate pages, apply
filters manually, and add up the numbers by hand. There is no channel
breakdown, no product ranking, no growth trend, and no comparison against
the previous month that spans both sources.

---

## Solution

A new **"Resultados"** page at `/results` replaces the deprecated Dashboard
and Analytics pages. It shows a consolidated executive view of one Sales
Period (a calendar month) — KPIs with period-over-period deltas, revenue by
Unified Channel, revenue by Unified Category, a top-products ranking, a
12-month growth chart, and an hourly temporal distribution — all from a
single API backed by a persistent cache so that past months load instantly.

---

## User Stories

1. As a manager, I want to open the Resultados page and immediately see the
   current month's gross revenue, so that I know how much we earned without
   switching between pages.
2. As a manager, I want to see a KPI card labelled "Receita Bruta" showing
   total invoices minus credit notes (with VAT), so that the headline number
   reflects what we actually earned.
3. As a manager, I want to see a secondary "Faturado Total" card showing the
   pre-cancellation invoice total, so that I can understand gross billing
   volume separately.
4. As a manager, I want to see a "Cancelamentos" card showing the count and
   value of credit notes for the period, so that I can spot unusually high
   cancellation rates at a glance.
5. As a manager, I want to see a "IVA cobrado" KPI card, so that I have the
   VAT figure without having to calculate it myself.
6. As a manager, I want to see a "Receita líquida" KPI card (Gross Revenue
   minus VAT), so that I know the net revenue figure.
7. As a manager, I want to see a "N.º de transacções" KPI card counting only
   invoices (credit notes excluded), so that I know how many sales occurred.
8. As a manager, I want to see a "Ticket médio" KPI card (Gross Revenue
   divided by invoice count), so that I can track average order value.
9. As a manager, I want each KPI card to show a delta percentage against the
   previous calendar month, so that I can assess month-over-month growth at
   a glance.
10. As a manager, I want to change the Sales Period using a month/year
    picker, so that I can review any past month.
11. As a manager, I want all KPI cards, charts and breakdowns to update
    when I change the Sales Period, so that everything on screen reflects
    the selected month.
12. As a manager, I want revenue broken down by Unified Channel (Salão, Take
    Away, Eatz, Uber Eats, Glovo, Bolt Food) with gross revenue, transaction
    count, average ticket and share % per channel, so that I know which
    channels drive the most business.
13. As a manager, I want all six canonical channels to be visible even when
    a channel has zero sales for the period, so that I can confirm a channel
    was inactive rather than wonder if the data is missing.
14. As a manager, I want to see the legacy "Apps" channel when I view a
    historical period that predates the AirMenu integration, so that
    pre-AirMenu revenue is not silently zero.
15. As a manager, I want revenue broken down by Unified Category (Pizzas,
    Bebidas Alcoólicas, Bebidas, Outros) with items sold, gross revenue,
    VAT and net revenue per category, so that I understand my product mix.
16. As a manager, I want to see the top-selling products ranked by gross
    revenue, with a toggle between Top 10, Top 20 and Top 50, so that I can
    make stocking and menu decisions.
17. As a manager, I want the top-products table to show each product once
    (unified by normalized title across Vendus and AirMenu) with the list of
    channels it appeared in, so that I see a true ranking rather than
    duplicates per source.
18. As a manager, I want to see a 12-month growth chart showing Vendus and
    AirMenu revenue stacked per month for the selected year, so that I can
    spot seasonality and growth trends.
19. As a manager, I want to toggle the growth chart between a stacked-bar
    view and a line view, so that I can pick the visualization that is
    clearest to me.
20. As a manager, I want to click a bar in the growth chart to navigate to
    that month's Sales Summary, so that I can drill down without using the
    month picker.
21. As a manager, I want to see how sales are distributed by hour of the
    day (invoice count, credit note count, and gross revenue per bucket), so
    that I can plan staffing and stock replenishment.
22. As a manager, I want a cache status bar showing how long ago the data
    was calculated (relative time + absolute timestamp on hover), so that I
    can decide whether to request a refresh.
23. As a manager, I want a "Actualizar" button in the cache status bar that
    recalculates the current period from live API data and updates the cache,
    so that I can get fresh numbers when I know new sales have occurred.
24. As a manager, I want past months to load instantly from cache, so that
    navigating through historical periods is fast.
25. As a manager, I want the current month to be served from cache if it was
    calculated within the last 15 minutes, so that repeated page loads are
    fast without sacrificing freshness.
26. As a manager, I want navigating to the old Dashboard (`/`) or Analytics
    (`/analytics`) URLs to redirect me to `/results`, so that my bookmarks
    continue to work.
27. As a manager, I want Dashboard and Analytics to be removed from the
    sidebar, so that the navigation is clean and unambiguous.

---

## Implementation Decisions

### Sales Period and API contract

- A **Sales Period** is a `(year, month)` pair. The API accepts only
  complete calendar months — no free date ranges.
- Endpoints:
  - `GET /api/sales-summary?year=&month=` — returns `SalesSummaryResult`
    (from cache or live); manager+ auth.
  - `GET /api/sales-summary/growth?year=` — returns
    `MonthlyGrowthPoint[]` for all 12 months of the year; manager+ auth.
  - `POST /api/sales-summary/refresh?year=&month=` — forces
    recalculation, saves to cache, returns full `SalesSummaryResult`;
    manager+ auth.
- `organizationId` is always read from `req.auth.orgId`; never from client
  params.

### Domain model (key type shapes)

```typescript
interface SalesSummaryResult {
  period: { year: number; month: number };
  cachedAt: Date;           // always set — every result goes through cache
  totals: {
    grossRevenue: number;   // cents — invoices minus NC, with VAT
    faturadoTotal: number;  // cents — invoices only, before NC subtraction
    vatCollected: number;   // cents
    netRevenue: number;     // cents — grossRevenue minus VAT
    transactionCount: number; // invoices only; NC excluded
    averageTicket: number;  // cents — grossRevenue / transactionCount
    creditNoteCount: number;
    creditNoteValue: number; // cents, positive
  };
  byChannel: ChannelSummary[];
  byCategory: CategorySummary[];
  topProducts: ProductRanking[];      // always top 50; UI slices
  temporalDistribution: TimeBucket[];
}

type UnifiedChannel =
  | "salao" | "take_away" | "eatz"
  | "uber_eats" | "glovo" | "bolt_food"
  | "apps"; // legacy — present only when historical data exists

interface ChannelSummary {
  channel: UnifiedChannel;
  grossRevenue: number;       // net of NC for this channel
  transactionCount: number;   // invoices only
  averageTicket: number;
  sharePercent: number;       // % of total grossRevenue across all channels
}

interface TimeBucket {
  hour: number;               // 0–23
  invoiceCount: number;
  creditNoteCount: number;    // NC count as positive integers
  grossRevenue: number;       // cents — NC contribute negatively
}

interface MonthlyGrowthPoint {
  year: number;
  month: number;
  vendusRevenue: number;      // cents
  airMenuRevenue: number;     // cents
  totalRevenue: number;       // cents
  cachedAt: Date | null;      // null only if month was never computed
}
```

### Backend module: `src/modules/sales-summary/`

Hexagonal structure following the `tasks` reference module. Key layers:

**Domain ports (output) — types defined here; no imports from vendus or
air-menu domain:**
- `VendusSummaryPort` — declares `VendusSummaryData` (subset of Vendus
  analytics needed by the calculator: grossRevenue, vatCollected,
  transactionCount, creditNotes, byChannel, byCategory, topProducts,
  temporalDistribution).
- `AirMenuSummaryPort` — declares `AirMenuSummaryData` (same shape, mapped
  from AirMenu analytics).
- `SalesSummaryCachePort` — `get(orgId, year, month)`,
  `save(orgId, year, month, data)`, `getYearMonths(orgId, year)`.
  `organizationId` is always the first parameter (D2 pattern from
  `AnalyticsCachePort` in the vendus module).

**Domain service:**
- `SalesSummaryCalculatorService` — pure function, no I/O. Takes
  `VendusSummaryData` + `AirMenuSummaryData` and returns
  `SalesSummaryResult`. Contains all merging logic: channel union, category
  mapping, product deduplication by normalized title, temporal bucket merge,
  NC subtraction.

**Use cases (application layer):**
- `GetSalesSummaryUseCase` — checks cache; if past month and cache hit →
  returns; if current month and `calculated_at` < 15 min → returns; else
  calls both source ports in parallel, calls calculator, saves to cache,
  returns. Accepts `forceRefresh: boolean` flag; when true skips cache check.
- `GetGrowthChartUseCase` — reads all cached months for the year via
  `SalesSummaryCachePort.getYearMonths`; for each past month not in cache,
  runs `GetSalesSummaryUseCase` sequentially (saving to cache before the
  next), then returns the full `MonthlyGrowthPoint[]`.

Both use cases share `SalesSummaryCalculatorService` injected as a
dependency.

### Unified Category mapping

| Unified Category | Vendus source | AirMenu source |
|---|---|---|
| Pizzas | `pizza` | parentCategory `Pizzas` (Classics, Specials, Sweeties) |
| Bebidas Alcoólicas | `bebida_alcoolica` | — |
| Bebidas | `bebida_nao_alcoolica` | `Drinks` (known approximation; see ADR-0011) |
| Outros | `sacos`, `outros` | parentCategory `Outros` |

### Top products

- Backend always returns top 50, ordered by `grossRevenue` descending.
- Deduplication: grouped by normalized product title (same normalization
  already applied by both source modules). One row per title; quantity and
  revenue summed across Vendus and AirMenu; `channels` field lists every
  channel where the product appeared.
- Frontend slices to the limit selected in the dropdown (10 / 20 / 50).

### Cache and DB

```sql
create table sales_summary_cache (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  year            integer not null,
  month           integer not null check (month between 1 and 12),
  payload         jsonb not null,
  total_revenue_cents   bigint not null,
  vendus_revenue_cents  bigint not null,
  air_menu_revenue_cents bigint not null,
  calculated_at   timestamptz not null default now(),
  unique (organization_id, year, month)
);
```

The three denormalized columns exist so that `getYearMonths` for the growth
chart can read 12 rows efficiently without deserializing 12 JSON blobs.

TTL logic for current month lives in `GetSalesSummaryUseCase`: if
`now() − calculated_at < 15 minutes` → cache hit; otherwise recalculate.
Past months have no TTL — they are immutable once computed and only change
on explicit `forceRefresh`.

Cache population is lazy by default. `POST /refresh` is the pre-warm
mechanism. A background cron (one month pre-computed on the 1st of each
month) is the documented next step but is out of scope for this iteration.

### AirMenu enterprise

New env var `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID` identifies the enterprise
to aggregate (currently "Angry Box"). "Angry Box - Porto" is excluded — see
ADR-0012.

### Composition root adapters

The composition root provides two adapters that bridge the source modules
to the sales-summary output ports:

- `VendusSummaryAdapter` — calls `GetSummaryPort` from the vendus module
  (already exposed by its composition root) and maps the result to
  `VendusSummaryData`.
- `AirMenuSummaryAdapter` — calls `GetSummaryPort` from the air-menu module
  with the configured enterprise ID and maps to `AirMenuSummaryData`.

Neither adapter lives inside the sales-summary domain; they live in
`sales-summary/adapters/out/`.

### Frontend module: `src/modules/sales-summary/`

- Route: `/results`
- Redirects: `/` and `/analytics` → `/results` (React Router).
- Sidebar: Dashboard and Analytics entries removed; "Resultados" added at
  the top of the navigation.
- Chart library: `recharts` — new dependency, must be added to
  `package.json`. No chart library is currently installed.
- New env var `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID` must be added to
  `.env.example` and `.env.local.example`.

**Component breakdown:**
- `SalesSummaryView` — root view.
- `PeriodSelector` — month/year picker.
- `KpiHeaderSection` — row of KPI cards with deltas.
- `ChannelBreakdownSection` — channel cards/table.
- `GrowthChartSection` — recharts stacked bar + line toggle; bar click
  navigates to that month.
- `CategoryBreakdownSection` — table by Unified Category.
- `TopProductsSection` — ranked table with Top 10/20/50 dropdown.
- `TemporalDistributionSection` — hourly bar chart (invoiceCount +
  creditNoteCount + grossRevenue per bucket).
- `CacheStatusBar` — relative time display with absolute tooltip and
  "Actualizar" button.

**Provider state (`SalesSummaryProvider`):**
- Selected Sales Period (year, month) — default: current month.
- Top products limit (10 | 20 | 50) — default: 20.
- Query for selected period (`GET /api/sales-summary`).
- Query for comparison period (previous calendar month — fixed in MVP).
- Query for growth chart (`GET /api/sales-summary/growth`).
- Refresh mutation (`POST /api/sales-summary/refresh`) — invalidates and
  refetches the selected period query on success.

---

## Testing Decisions

Good tests verify observable behavior of a seam, not internal wiring. A
test should fail only when the business rule it covers changes — not when
a private method is renamed or an intermediate variable is extracted.

### Seam 1: `SalesSummaryCalculatorService` (domain service — pure function)

This is the highest-value seam. It has no I/O and concentrates all merging
logic. Test suite covers:

- Channel merge: all 6 canonical channels always present; "apps" appears
  only when Vendus data includes it; values from both sources summed
  correctly per channel.
- `sharePercent` sums to 100 across all channels (within floating-point
  tolerance).
- Gross revenue = invoices − NC (not raw Vendus or AirMenu totals).
- `faturadoTotal` = invoices only (NC not subtracted).
- Category mapping: each Vendus and AirMenu category routes to the correct
  Unified Category; AirMenu Drinks → Bebidas.
- Product deduplication: same normalized title from Vendus and AirMenu
  merged into one row with summed quantity and revenue; distinct titles
  remain separate entries.
- Temporal merge: invoiceCount and creditNoteCount kept separate per bucket;
  grossRevenue from NC contributes negatively; buckets with only NCs have
  negative grossRevenue and positive creditNoteCount.
- Result top-products list is capped at 50 and ordered by grossRevenue
  descending.

### Seam 2: `GetSalesSummaryUseCase` (with fakes for all output ports)

Pattern: `FakeVendusSummaryPort`, `FakeAirMenuSummaryPort`,
`FakeSalesSummaryCachePort` — same pattern as `FakeTaskRepository` in
`src/modules/tasks/__tests__/fakes/`.

Test scenarios:

- Past month, cache hit → returns cached payload; source ports never called.
- Past month, cache miss → source ports called; result saved to cache;
  correct `SalesSummaryResult` returned.
- Current month, `calculated_at` < 15 min → cache hit; source ports never
  called.
- Current month, `calculated_at` ≥ 15 min → recalculated; cache updated.
- `forceRefresh=true` on a past month → bypasses cache; source ports called;
  cache overwritten.
- Error from one source port → propagated; cache not written.

### Seam 3: `GetGrowthChartUseCase` (with fakes)

- All 12 months cached → returns immediately; no calculator invocations.
- 3 months missing → calculator invoked exactly 3 times, sequentially; each
  missing month saved to cache before the next is computed.
- Returned `MonthlyGrowthPoint[]` has exactly 12 entries; missing months
  that failed calculation have `cachedAt: null`.

**Prior art:** `src/modules/tasks/__tests__/use-cases/` for the fake-port
pattern; `src/modules/vendus/__tests__/use-cases/get-analytics-historical.use-case.test.ts`
for cache hit/miss logic.

---

## Out of Scope

- Free date range queries (Sales Period = calendar month only; see ADR-0010).
- "Angry Box - Porto" AirMenu enterprise (see ADR-0012).
- Year-over-year comparison in the growth chart (documented for a future
  iteration; the chart component should be designed to accommodate it).
- Background cron for cache pre-computation (documented in ADR-0013 as the
  next step; not part of this spec).
- Employee self-consumption (`/vendus/selfconsumption`) data on this page.
- DRE, cost data, CMV or margin figures — this page covers revenue only.
- Sub-hour temporal granularity.
- Per-PLU AirMenu alcohol classification to split "Drinks" between Bebidas
  and Bebidas Alcoólicas (documented approximation; see ADR-0011).
- The existing Vendus and AirMenu drill-down pages — they stay untouched.

---

## Further Notes

- `recharts` must be added to the frontend `package.json` before any chart
  component is written. No chart library is currently installed.
- `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID` must be added to `.env.example`.
- ADRs 0010–0013 (`docs/adr/`) document the key decisions made during
  grilling and must be read before implementation.
- The growth chart cold start (first load of a year with no cached months)
  is a known slow path. `POST /refresh` is the pre-warm mechanism. The
  README of the module must document this limitation.
- The AirMenu Drinks → Bebidas approximation is a documented known issue,
  not a bug. Do not "fix" it without a spec change that introduces per-PLU
  alcohol classification.
- The spec supersedes the previous draft (`spec.md`). All decisions are
  settled and recorded; no further grilling is needed before implementation.
