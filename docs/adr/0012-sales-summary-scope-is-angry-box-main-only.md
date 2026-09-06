# Sales Summary scope is Angry Box (main location) only

The sales-summary module aggregates Vendus data (one register, main
location) with AirMenu enterprise "Angry Box"
(`AIRMENU_SALES_SUMMARY_ENTERPRISE_ID`). The AirMenu enterprise "Angry Box -
Porto" is deliberately excluded.

Porto is an independent Location with its own P&L, staff and operational
context. Merging it into a single summary would produce numbers that are
meaningless for either location's day-to-day management — the manager of the
main location cannot act on Porto's figures, and vice versa. Summing all
enterprises (the alternative) was rejected on this ground.

If a multi-location consolidated view is ever needed it should be a separate
route with explicit Location selection, not a scope change to this module.
The `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID` env var is the configuration point;
no code change is required to point it at a different enterprise.

Related: `.scratch/sales-summary/spec.md` D8; `CONTEXT.md` Location.
