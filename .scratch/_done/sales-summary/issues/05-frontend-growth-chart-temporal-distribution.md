# 05: Frontend — growth chart + temporal distribution

**What to build:** The two chart sections of the Resultados page are live. The manager can see a 12-month stacked revenue chart (Vendus + AirMenu per month), toggle it between bar and line views, click a month bar to navigate to that month's summary, and see an hourly heatmap of sales activity showing invoice count, credit note count and gross revenue per hour.

**Blocked by:** 02, 03

**Status:** done

- [x] `recharts` added to the frontend `package.json` (it is not currently installed).
- [x] `GrowthChartSection` fetches from `GET /api/sales-summary/growth?year=` (query added to `SalesSummaryProvider`). Renders a stacked chart with one bar/line pair per month: Vendus revenue stacked below AirMenu revenue. Months with `cachedAt: null` render as empty with a tooltip "sem dados".
- [x] Bar/line toggle is local component state (not provider state); default is bar.
- [x] Clicking a month bar or point navigates to `/results` with that month pre-selected in the period selector (updates provider state).
- [x] `TemporalDistributionSection` renders hourly buckets (0–23) from `temporalDistribution` in the main period query result. Each bucket shows `invoiceCount`, `creditNoteCount` and `grossRevenue`. Buckets where `grossRevenue` is negative (more cancellations than invoices in that hour) are visually distinct.
- [x] Both chart components use recharts primitives consistently with each other.
- [x] All chart axes and tooltips display values in pt-PT locale (€ for monetary, integer for counts).
