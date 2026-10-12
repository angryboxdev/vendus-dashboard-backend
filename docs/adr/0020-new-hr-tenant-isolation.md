# Tenant isolation for the new HR: org_id + scoped helper now, org-claim RLS before a second org in production

Task RH (phased), Phase 0, ADR-003 (multi-tenant strategy and RLS). The task
asks for `tenant_id` on every table, RLS in the database and a check in the
service (§4.2).

Decided, building on ADR-0005, ADR-0007 and ADR-0008:

1. Every new HR table has `org_id uuid not null` (the spec's `tenant_id`) and,
   where it belongs to a place, `location_id` (the spec's "centro").
2. Every query goes through the scoped-query helper, which cannot build a
   query without an organization. Enforced by dependency-cruiser
   (`supabase-so-no-scoped-db`) and now also in CI (ADR-0022 §CI).
3. Every new HR table ships with RLS **enabled** and an org-claim policy
   (`org_id = current_org()`, function already in production since
   `20260909130000`) in the same migration. While the backend still connects
   as the service role, these policies are a net for any other client, not
   the main boundary (ADR-0007 explains why).
4. Scope inside a tenant (centre, department, own data — RE-34, CF-15) is
   checked in the use case, not only by hiding menus.

## Second organization gate (status 2026-10-11)

`runOrganizationProvisioning.ts` says no second `organizations` row may exist
in production until the deferred items land. Verified in `.scratch/_done/`:
device identity (location-credentials), composite keys and indexes, CRM
primary keys, kiosk PIN and storage path prefixing are **done**. Still
**open**: org-claim RLS on ordinary tables (only storage has it) and seed
template data for a new organization.

Therefore the demo organization (ADR-0021) is created **only in local and
staging** until those two items are closed and someone approves it. This is
the safest option (task §4.6.6).

## Consequences

- RE-33 (tenant isolation on every endpoint) is tested from Phase 1 against
  two organizations in the local stack.
- Closing the gate in production is a separate piece of work, with its own
  approval.
