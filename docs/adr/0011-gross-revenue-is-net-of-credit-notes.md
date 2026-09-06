# Gross Revenue in Sales Summary is net of credit notes

The headline revenue KPI in the sales-summary module (`totals.grossRevenue`,
labelled "Receita Bruta" in the UI) subtracts the value of credit notes from
the sum of invoices for the period. VAT is still included — the gross/net
dimension for VAT is unchanged from the rest of the codebase.

This deviates from strict accounting usage, where "gross revenue" means the
sum of all invoices before any deductions. The alternative was kept as a
secondary informative card ("Faturado Total") alongside a "Cancelamentos"
card showing NC count and value. The primary KPI was made net-of-NC because
the headline number answers the operational question "how much did we
actually earn this period?" — asking the manager to subtract mentally
increases cognitive load on the most-read number in the UI.

**Known approximation — AirMenu category taxonomy:** AirMenu's single
"Drinks" category maps to the Unified Category "Bebidas" (non-alcoholic).
AirMenu makes no alcoholic/non-alcoholic distinction in its catalogue; a
per-PLU mapping would be needed to route alcoholic items to "Bebidas
Alcoólicas". Accepted for MVP; to be revisited if the category breakdown
becomes a reporting requirement.

Related: `.scratch/sales-summary/spec.md` D1, Q10, Q14, Q15.
