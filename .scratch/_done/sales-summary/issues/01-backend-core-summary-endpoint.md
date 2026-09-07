# 01: Backend core — cache schema + summary endpoint

**What to build:** The `GET /api/sales-summary?year=&month=` and `POST /api/sales-summary/refresh?year=&month=` endpoints working end-to-end. A manager with a `manager+` role can call either endpoint and receive a `SalesSummaryResult` consolidating Vendus and AirMenu data for the requested Sales Period (calendar month). Past months are served from cache on repeated calls. The current month is recalculated if the cache entry is older than 15 minutes. `POST /refresh` bypasses the cache, recalculates from live APIs, updates the cache and returns the new result.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] DB migration creates `sales_summary_cache` with columns: `organization_id`, `year`, `month` (UNIQUE together with org), `payload` (jsonb), `total_revenue_cents`, `vendus_revenue_cents`, `air_menu_revenue_cents`, `calculated_at`.
- [x] New hexagonal module `src/modules/sales-summary/` follows the structure of the `tasks` reference module.
- [x] Domain output port `VendusSummaryPort` declares its own `VendusSummaryData` type — no imports from the vendus module domain.
- [x] Domain output port `AirMenuSummaryPort` declares its own `AirMenuSummaryData` type — no imports from the air-menu module domain.
- [x] Domain output port `SalesSummaryCachePort` declares `get`, `save`, and `getYearMonths`; `organizationId` is the first parameter on every method (D2 pattern).
- [x] `SalesSummaryCalculatorService` is a pure domain service (no I/O) that merges `VendusSummaryData` + `AirMenuSummaryData` into `SalesSummaryResult`. Covers: channel union (6 canonical always present; `apps` when Vendus data includes it), NC subtracted from `grossRevenue`, `faturadoTotal` = invoices only, category mapping to the four Unified Categories, product deduplication by normalized title (quantities and revenue summed; channels listed), `sharePercent` per channel, `invoiceCount` and `creditNoteCount` kept separate in temporal buckets.
- [x] `GetSalesSummaryUseCase` orchestrates: cache check → if past month and hit, return; if current month and `calculated_at` < 15 min, return; else call both source ports in parallel, run calculator, save to cache, return. Accepts `forceRefresh: boolean`; when true skips cache read (still writes after calculation).
- [x] `VendusSummaryAdapter` (out adapter) calls the vendus module's `GetSummaryPort` (injected from composition root) and maps the result to `VendusSummaryData`.
- [x] `AirMenuSummaryAdapter` (out adapter) calls the air-menu module's `GetSummaryPort` for the enterprise configured in `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID` and maps to `AirMenuSummaryData`.
- [x] `SupabaseSalesSummaryCacheAdapter` implements `SalesSummaryCachePort` using the `ScopedQueryFactory` pattern (same as `SupabaseAnalyticsCacheAdapter` in the vendus module).
- [x] `SalesSummaryController` exposes `GET /api/sales-summary?year=&month=` and `POST /api/sales-summary/refresh?year=&month=`; `organizationId` always read from `req.auth.orgId`.
- [x] `createSalesSummaryModule()` wires everything and is registered in `server.ts`.
- [x] `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID` added to `.env.example`.
- [x] Unit tests for `SalesSummaryCalculatorService`: channel merge, NC subtraction, `faturadoTotal`, category mapping (all four Unified Categories from both sources), product deduplication, `sharePercent` sums to 100, temporal bucket separation of invoice/creditNote counts.
- [x] Unit tests for `GetSalesSummaryUseCase` with fakes for all three output ports: cache hit (past month), cache miss → calculates + saves, TTL hit (current month < 15 min), TTL miss (current month ≥ 15 min), `forceRefresh=true` bypasses cache, source port error does not write cache.
- [x] Module README created following `docs/agents/module-readme-template.md`.
