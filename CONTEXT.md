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
_Avoid_: Store, Branch.
