# 02: Backend — growth chart endpoint

**What to build:** `GET /api/sales-summary/growth?year=` working end-to-end. A manager calls this endpoint and receives a `MonthlyGrowthPoint[]` with one entry per month of the requested year. Months already in `sales_summary_cache` are served instantly from the three denormalized columns. Past months not yet in cache are calculated on-demand sequentially — each month is saved to cache before the next is computed, so a concurrent request benefits from the already-computed months. The response always has 12 entries; months that could not be computed have `cachedAt: null`.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `GetGrowthChartUseCase` reads all cached months for the year via `SalesSummaryCachePort.getYearMonths`.
- [ ] For each past month absent from cache, the use case runs the same calculation logic as `GetSalesSummaryUseCase` (shared via `SalesSummaryCalculatorService`) sequentially, saving each result to cache before advancing to the next.
- [ ] Current month follows the same TTL logic as ticket 01 (recalculate if `calculated_at` ≥ 15 min).
- [ ] `SalesSummaryController` exposes `GET /api/sales-summary/growth?year=`; `organizationId` from `req.auth.orgId`.
- [ ] Unit tests with fakes: all 12 months cached → no calculator calls; 3 months missing → calculator called exactly 3 times in month order; each missing month saved before the next is computed; a computation failure for one month does not abort the others (that month's entry has `cachedAt: null`).
- [ ] Module README updated to document the cold-start behaviour (first load of a year with many uncached months is slow; `POST /refresh` is the pre-warm mechanism).
