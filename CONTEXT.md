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
_Avoid_: Device (this codebase does not model a Device entity — the
credential is per-Location, not per-device), Device Token, Device Identity
(the deferred register's name for this concept, kept for historical
cross-reference but not accurate: nothing here is scoped to a device).

**Pairing Code**:
A short-lived, single-use code an org admin generates for a specific
Location, entered once on an unpaired screen to redeem a Location Token. Not
itself a credential — it authorizes exactly one redemption, then is burned
whether it succeeded or expired.
