# Manual sales entry ships in v1 as a core SalesSourcePort implementation

The sales ledger (`sales_documents`/`sales_lines`) needs a system of record
for revenue — today it's rented live from Vendus over HTTP on every read.
Decided: manual daily-total entry ships in v1, in the same phase as the
ledger, as a core-provided implementation of `SalesSourcePort` — not a side
door that writes to the ledger directly.

## Consequences

A tenant with no supported POS can still use the product — the cheap
onboarding wedge. It also doubles as proof that `SalesSourcePort` is really
source-agnostic: if manual entry is awkward to express through the port, the
port is wrong, and it's better to learn that with the first connector still
in hand.

Related: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §3.3.
