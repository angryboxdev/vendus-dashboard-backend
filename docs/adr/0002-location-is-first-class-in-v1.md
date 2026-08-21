# Location is a first-class table in v1, not deferred

Multi-tenancy needs two isolation levels: Organization (tenant — billing,
users, integration credentials) and Location (a physical store — cash drawer,
stock, shift, daily closing). Decided: model Location as real rows from v1,
not a single placeholder location per organization, because retrofitting a
second level later means touching all 46 tables twice.

## Consequences

`location_id` lands alongside `org_id` in the same migration pass (phase 3)
on operational tables (`cash_closings`, `stock_movements`, `hr_work_shifts`,
invoices). Every operational use-case input DTO carries `locationId` next to
`orgId` from day one, and "which store" becomes a filter in cash closings,
stock and reports — even though Angrybox itself has only one location today.

Related: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §2.2.
