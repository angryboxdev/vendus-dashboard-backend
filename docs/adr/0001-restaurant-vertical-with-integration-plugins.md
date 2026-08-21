# Restaurant vertical is the product; integrations are the only plugin axis

The multi-tenancy design forked between a restaurant-vertical back-office
(core is allowed restaurant opinions) and a horizontal SMB back-office (core
stays domain-neutral, verticals are packs). Decided: the restaurant vertical.
Core owns the concept and normalized shape of products, recipes, stock,
channels and the sales ledger; only POS/delivery/bank integration adapters
(Vendus, later Zettle/Square, AirMenu) are plugins. Reasoning: the
vertical→horizontal direction of travel is well-trodden and reversible, the
reverse is not; the real moat is Portuguese-market integration and locality,
not generic accounting; the horizontal alternative's configurable taxonomy
costs weeks of engineering with zero benefit to the only current customer and
makes the domain anemic.

## Consequences

`financial-base`, `bank-accounts`, `bank-statements` and `payable-entries`
must stay free of restaurant vocabulary (no `pizza`, `service`, `channel` in
their domain layers) — enforceable with a `dependency-cruiser` rule — so the
horizontal option stays reachable later if this bet is wrong.

Related: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §3 (Recommendation + trade-off
table).
