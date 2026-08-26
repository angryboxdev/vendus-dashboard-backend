# Deploy order: tenant identity (org claims)

This migration renames the token's role claim to an org-scoped one (`org_role`)
and adds `org_id`. The claim shape changes the instant the DB migration runs —
independent of any app deploy — so the order below is not optional.

## Order

1. **Front end ships first.** It reads `org_id`/`org_role` but falls back to
   the old claim when they're absent. Harmless to ship early: the old claim is
   still what arrives until step 2.
2. **The migration runs.** Tokens now carry `org_id` and `org_role`. The front
   end (already deployed) understands them; the back end (not yet deployed)
   falls back to its `app_users` lookup, so sessions keep working.
3. **The back end ships**, reading the organization from `org_id`/`org_role`.
4. **The fallback is removed** in a later release, once both sides are
   confirmed on the new claims.

**Only step 1 must precede step 2.** Steps 3 and 4 can slip without an outage.
Getting 1 and 2 out of order logs every user out: the back end (and, before
the front end ships, the front end too) reads a role claim that no longer
exists.

## Known failure signature: missing `supabase_auth_admin` grant

The token hook runs as `supabase_auth_admin` and needs an explicit `select`
grant on `org_members`. If that grant is missing, the hook doesn't error — it
silently injects no claims at all. This presents as **every user locked out**,
with no indication in the response of why. If a deploy of this migration is
followed by a wave of failed logins, check the grant first:

```sql
select * from information_schema.role_table_grants
where table_name = 'org_members' and grantee = 'supabase_auth_admin';
```

Expect a `SELECT` row. If it's missing, grant it and have affected users retry
— no redeploy needed, since the hook re-reads on the next token issuance.

## Do not provision a second organization yet

Production must stay single-organization until the deferred register's
"before org #2" items land — device identity for user-less paths, org-claim
RLS policies, composite keys, and seed template data are all gated on it. See
`.scratch/tenant-identity/spec.md`, "Deferred register", for the full list and
triggers. The provisioning script works today only to exercise the
multi-organization paths in a non-production environment.
