# 03: Frontend shell — route + provider + KPI header + cache bar

**What to build:** The `/results` page is live in the browser. A manager can open it, see the current month's KPI cards with previous-month deltas, change the month using the period selector, force a data refresh, and read the cache status. Navigation is updated: Dashboard and Analytics are gone from the sidebar; Resultados is at the top. The old `/` and `/analytics` URLs redirect to `/results`.

**Blocked by:** 01

**Status:** done

- [x] New frontend module `src/modules/sales-summary/` with hexagonal structure matching the project's frontend pattern.
- [x] `SalesSummaryProvider` manages: selected Sales Period (year + month, default current month), the main period query (`GET /api/sales-summary?year=&month=`), the comparison period query (previous calendar month — always one month back, fixed in MVP), and the refresh mutation (`POST /api/sales-summary/refresh?year=&month=`).
- [x] `PeriodSelector` — month/year picker; changing it updates the provider state and triggers both queries.
- [x] `KpiHeaderSection` — eight cards: Receita Bruta, Faturado Total, Cancelamentos (count + value), IVA cobrado, Receita líquida, N.º de transacções, Ticket médio. Each card shows the selected-period value and a delta percentage against the comparison period (arrow + %).
- [x] `CacheStatusBar` — shows relative time ("há 8 minutos") with absolute timestamp in a tooltip; "Actualizar" button calls the refresh mutation and is disabled while the mutation is in-flight.
- [x] Route `/results` added to `App.tsx` with `SalesSummaryProvider` wrapping the view.
- [x] React Router redirects: `/` → `/results`, `/analytics` → `/results`.
- [x] Sidebar: Dashboard and Analytics entries removed; "Resultados" entry added at the top of the navigation list.
- [x] All monetary values displayed in pt-PT locale (€), consistent with the rest of the financial modules.
- [x] Visual style consistent with existing financial module pages (header `border-b border-[#F5C992]/40`, KPI cards `px-5 py-4 shadow-sm`, brand gradient from `#ED5C32` to `#EF8935`).
