# Roles are scoped to (user, org), not global to the user

Multi-tenancy needs one user to hold different roles in different
organizations. Decided: a role is a property of the (user, org) pair, not a
global property of the user account — modelled as a membership
(`org_members(org_id, user_id, role)`).

## Consequences

`custom_access_token_hook` stops injecting a bare `app_role` and injects the
org plus the role held *in that org*; `AuthPayload` follows the same shape.
The role taxonomy itself (`admin | manager | hr_viewer`, already flagged as
not great) is a separate, still-open question — org-scoping is orthogonal to
fixing it.

Related: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §2.6, phase 4.
