# Angry Box Hub Backend

Back-office platform for restaurant businesses — cash closings, bank
reconciliation, supplier invoices, stock. Built single-tenant for one
pizzeria (Angrybox); moving to a multi-tenant SaaS (see
`docs/MULTI_TENANCY_SAAS_DESIGN.md`).

## Language

**Tenant**:
The architectural role the data-isolation boundary is enforced on. Not an
entity itself — see Organization for the concrete row that plays this role.

**Organization**:
The concrete tenant entity: one row per legal entity (one NIF), the customer
that signed the contract. The boundary for data isolation, billing, users and
integration credentials. `org_id` on a table means "which organization owns
this row."
_Avoid_: Tenant (for the concrete row — use Organization; Tenant is only the
architectural concept), Company, Account.

**Location**:
A physical store or operating unit belonging to one Organization. The
operational boundary — cash drawer, register, shift, stock and daily closing
all belong to a location, not directly to the organization.
Not everything is attributable to one: a cost can belong to the Organization
and to no store — digital marketing, the accountant's fee, group insurance.
"Which store" is a question with a legitimate empty answer, so an unallocated
cost is a real state and not missing data.
_Avoid_: Store, Branch.

**Location Token**:
An opaque, DB-backed credential scoped to one Location, issued by pairing an
unattended screen (kiosk, till-closing, kitchen display) that has no user to
authenticate as. Proves "this caller is a screen paired to Location X" —
nothing about which physical screen, and nothing about which employee is
using it. Several tokens can exist for one Location (one per paired screen),
each individually revocable; there is no separate row identifying the
physical device itself.
Deliberately unrestricted across features: a single token authorizes kiosk,
till-closing and KDS requests equally, so one physical screen that serves
more than one of those pages pairs once, not once per page. There is no
feature-scoped variant.
Carries an optional, nullable, write-once `description` copied from the
`PairingCode` that minted it — a plain opaque label (e.g. "Kitchen monitor")
with no identity or lookup semantics: it cannot be used to look anything up,
is not unique, and nothing branches on its value. Not the Device entity
below; fixing a typo means revoking and re-pairing, not editing the field.
_Avoid_: Device (this codebase does not model a Device entity — the
credential is per-Location, not per-device), Device Token, Device Identity
(the deferred register's name for this concept, kept for historical
cross-reference but not accurate: nothing here is scoped to a device).

**Pairing Code**:
A short-lived, single-use code an org admin generates for a specific
Location, entered once on an unpaired screen to redeem a Location Token. Not
itself a credential — it authorizes exactly one redemption, then is burned
whether it succeeded or expired.
Carries the same optional, nullable, write-once `description` set by the
admin at generation time — the only channel that value has to reach the
`LocationToken` minted later, since generation and redemption are separate
requests, possibly by different actors minutes apart.

## Sales analytics

**Sales Period**:
A calendar month (year + month pair) — the unit of revenue analysis in the
sales-summary module. Free date ranges are not supported; the calendar month
boundary is the only granularity the module accepts.
_Avoid_: Reporting period, date range, interval.

**Sales Summary**:
A consolidated revenue view for one Sales Period, aggregating Vendus
(in-person channels) and AirMenu (delivery platform channels) into a single
result.
_Avoid_: Dashboard, report.

**Unified Channel**:
One entry in the channel breakdown of a Sales Summary: Salão, Take Away,
Eatz, Uber Eats, Glovo, Bolt Food. The legacy Apps channel (pre-AirMenu
platform deliveries billed directly in Vendus) is also a Unified Channel,
present only when historical data exists for the period.
_Avoid_: Source (use for the two data-source systems — Vendus and AirMenu —
not for individual channels).

**Unified Category**:
One of four product groups used to reconcile Vendus and AirMenu taxonomies
in a Sales Summary: Pizzas, Bebidas Alcoólicas, Bebidas, Outros. AirMenu
"Drinks" maps to Bebidas (known approximation — AirMenu makes no
alcoholic/non-alcoholic distinction; see ADR-0011 note). Vendus "sacos"
maps to Outros.
_Avoid_: Category (ambiguous — qualify as Unified Category, Vendus category,
or AirMenu category when the distinction matters).

**Gross Revenue**:
Revenue that includes VAT (as opposed to Net Revenue, which excludes VAT).
In the Sales Summary module the headline Gross Revenue KPI additionally
subtracts credit note values for the period — see ADR-0011. The
pre-cancellation total (invoices only, before NC subtraction) is called
Faturado Total and is shown as a secondary informative card.
_Avoid_: Total Revenue (ambiguous across contexts).

## Accounting

**VAT Deductible** (`vat_deductible` on `cost_center_categories`):
A manual, per-subcategory flag set by the manager in Centros de Custo
(`financial-base`). It only *suggests* a default (100% or 0%) for a
Document's or invoice line's VAT deductibility — the manager can override
it with an explicit percentage, but only with a justification
(`deductibilityOverrideReason`, both on `accounting_documents` and on
`invoice_lines`). Never inferred from a tax rule by the application, and
never decided by the category alone once a human overrides it. A
line/document with no category and no override counts as deductible by
default, so it never silently vanishes from the balance (it surfaces
instead as a classification pending item).
_Avoid_: Tax-exempt, non-recoverable (use the exact term above so it's
searchable across `financial-base`, `invoices` and `accounting`).

**AccountingDocument ("Documento")**:
Any accounting/fiscal document that doesn't flow through the company's own
bank account/card/cash (`documentType`: fatura paga por sócio, fatura paga
por funcionário, comissão de plataforma, nota de crédito, documento
manual, regularização, outro; `fundingSource`: partner/employee/platform/
other). The one entity the `accounting` module actually creates — regular
invoices and credit notes paid through the company's own funds are
read-only there, authored exclusively in the `invoices` module. Never hard
deleted — `cancel(reason)` is the only way to "remove" one. Duplicate
detection cross-checks NIF+document number+date+total against both this
table and `invoices`.
_Avoid_: Fatura, despesa, Partner Expense (superseded term — qualify as
"Documento"/`AccountingDocument` when referring to this specific entity).

**Documentos (Accounting)**:
The aggregated, read-only list in the `accounting` module that combines
`invoices` (Faturas/Notas de Crédito) with `AccountingDocument`s. Never a
parallel CRUD for invoices — editing one still happens only in the
`invoices` module.
_Avoid_: Document list, invoice list (ambiguous with the `invoices`
module's own Faturas screen).

**VAT Period / Período de IVA**:
The accounting module's own generalization of "trimestre" to also cover
"mês" — which one applies is a per-organization setting
(`accounting_settings.vat_periodicity`, `monthly`|`quarterly`, default
`quarterly`), never hardcoded. `getVatPeriodRange(periodicity, year,
period)` resolves it to a calendar date range.
_Avoid_: Trimestre (only correct when periodicity is actually quarterly —
use "período" when periodicity is unknown or configurable).

## Stock (integração Financeiro→Stock)

**Compra por rever / Stock Purchase Review**:
The bridge between a finalized invoice and physical stock, owned by the
`stock-purchase-review` module. Never a second invoice, never a second
OCR/import — only a reference to the same `invoice_id` (UNIQUE: one
invoice never has two active reviews). Created only when the decision
engine (category/supplier/override — never Centro de Custo) says the
invoice should affect stock; a human must resolve every line and
explicitly confirm before any `stock_movements` row is written.
_Avoid_: Fatura de stock, segunda fatura (this is never a parallel
invoice — editing an invoice always happens only in `invoices`).

**Origem dos fundos (Funding Source) vs. Centro de Custo**:
"Funding source" (`partner|employee|platform|other` on `accounting`'s
`AccountingDocument`) is who actually paid. Centro de Custo is where the
cost belongs operationally/financially. Neither ever decides whether an
invoice affects physical stock — that's `stockReviewPolicy` (category)
and `defaultStockPolicy` (supplier) alone, both on `financial-base`
entities but read by `stock-purchase-review` (D10). Centro de Custo is
reserved for a possible future location inference, never a stock-impact
signal.
_Avoid_: using "Centro de Custo" or "origem dos fundos" interchangeably
with "decisão de impacto em stock" — they're related concepts owned by
different modules, never the same field.

**Resolução de linha (Line Resolution)**:
Every `StockReviewLine` in a review must end as exactly one of
`existing_item` (mapped to a stock item, with a unit conversion factor),
`new_item` (creates a catalog item starting at quantity 0 — creating the
catalog entry is never the same as adding inventory), or
`no_stock_effect` (service/fee/discount, still auditable and learnable).
_Avoid_: "classificação" (used elsewhere for `invoices`' cost-center
classification — a different concept, don't conflate the two).
