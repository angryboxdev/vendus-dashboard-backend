# Sales Period is a calendar month, not a free date range

The sales-summary module accepts only a year+month pair as its period
selector. Free date ranges were proposed in the initial spec and explicitly
rejected.

Three constraints made arbitrary ranges unworkable together: (1) the cache
strategy requires fixed boundaries — `sales_summary_cache` has a UNIQUE
constraint on `(organization_id, year, month)`, and there is no natural key
for a free range; (2) the comparison period ("previous period") is
unambiguous only for complete months — for a 15-day range, "previous
equivalent period" has no obvious definition; (3) the N+1 cost of fetching
Vendus document details makes uncached arbitrary ranges unreliably slow with
no mitigation path short of per-day caching, which is a separate
feature of comparable complexity.

If sub-month granularity is needed in the future it should arrive as its own
cache strategy (e.g., per-day rows) and its own API surface, not as a
retrofit of the month endpoints.

Related: `.scratch/sales-summary/spec.md` D3, D6.
