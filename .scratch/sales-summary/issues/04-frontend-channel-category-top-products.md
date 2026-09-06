# 04: Frontend — channel breakdown + category breakdown + top products

**What to build:** Three data sections visible and correct on the Resultados page. The manager can see revenue by Unified Channel (all six canonical channels always shown, plus the legacy Apps channel when historical data exists), revenue by Unified Category (Pizzas / Bebidas Alcoólicas / Bebidas / Outros), and a top-products ranking with a dropdown to switch between Top 10, Top 20 and Top 50.

**Blocked by:** 03

**Status:** done

- [x] `ChannelBreakdownSection` renders one card or row per channel in `byChannel`. All six canonical channels (Salão, Take Away, Eatz, Uber Eats, Glovo, Bolt Food) are always shown, even at zero. The `apps` channel ("Plataformas (legado)") is shown only when present in the response. Each entry shows gross revenue, transaction count, average ticket, and share %.
- [x] `CategoryBreakdownSection` renders a table with one row per Unified Category (Pizzas, Bebidas Alcoólicas, Bebidas, Outros), showing items sold, gross revenue, VAT and net revenue.
- [x] `TopProductsSection` renders a ranked table (title, quantity sold, gross revenue, channels). A dropdown in the section header switches between Top 10, Top 20 and Top 50; state lives in `SalesSummaryProvider`. The backend always returns top 50; the frontend slices client-side.
- [x] Top-products table shows the unified channels list per product (e.g. "Salão, Uber Eats") so the manager can see where the product was sold.
- [x] All sections read from the already-fetched provider query — no additional API calls.
