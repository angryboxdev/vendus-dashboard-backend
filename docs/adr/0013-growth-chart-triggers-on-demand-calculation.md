# Growth chart triggers on-demand sequential calculation for uncached months

When `GET /api/sales-summary/growth?year=` finds past months without a
cache entry it calculates those months on-demand, one at a time, rather than
returning zeros or triggering parallel requests.

Returning zeros for uncached months was rejected because it would silently
misrepresent revenue history as zero revenue — worse than a slow load.
Parallel calculation was rejected because each month requires N+1 Vendus API
calls (one list fetch plus one detail fetch per document) plus AirMenu
GetOrderIds and parallel GetOrders; running all missing months concurrently
could fire hundreds of simultaneous requests against both external APIs,
which have undocumented rate limits.

Sequential calculation saves each month to `sales_summary_cache` before
moving to the next, so a second concurrent request for the growth chart will
find the already-computed months in cache. The consequence is that a cold
start over a full year (all 12 months uncached) can take tens of seconds;
this is a documented limitation. The `POST /api/sales-summary/refresh`
endpoint is the recommended way to pre-warm the cache for a specific month.
A background cron job that pre-computes the previous month on the 1st of
each month is the documented next step to eliminate cold starts in
production.

Related: `.scratch/sales-summary/spec.md` Q26, Q30; ADR-0010.
