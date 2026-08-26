# App-level scoping is the tenant boundary; RLS is a later, additive net

Settles open decision 3 of `docs/MULTI_TENANCY_SAAS_DESIGN.md` §6. Isolation is
enforced in the application, by a scoped query helper that cannot produce a
query without an `orgId`. Row Level Security is **not** part of that boundary in
spec B; it lands afterwards as defence in depth, gated before organization #2.

The decision turns on a fact about the topology. This is a thick-backend system,
not a Supabase-native one: the frontend imports Supabase in three files, all for
authentication, and issues **zero** queries — every byte of data crosses the
Express API. The browser therefore never meets the database, which is the
condition that makes RLS mandatory in a BaaS architecture. Absent it, app-level
scoping is the ordinary answer, as it is in any Rails or Django SaaS.

Two further facts made RLS-as-the-boundary a poor fit *now* rather than merely
unnecessary. The service role **bypasses policies entirely** — Postgres does not
evaluate them — so the "RLS as backstop" phrasing of §2.6 described a net that
does not exist; a real net requires changing what the app authenticates as, not
just adding policies. And four route groups have no user at all: the kiosk,
air-menu, KDS and cash-closing submit routes mount before `requireAuth`
(`src/server.ts:57–90`), as do both cron jobs — so policies keyed on
`auth.uid()` would need a privileged second path for the money write.

The eventual net is therefore the **org-claim** variant, not the user-token one:
the backend authenticates as a non-privileged role declaring which org it acts
for, and policies read `org_id = current_org()`. That works with no logged-in
user, so kiosk and cron are first-class, and it compares an indexed column
against a constant rather than running a correlated subquery per query. It does
not replace the helper — the greenfield arrangement is both, the helper filtering
and the policy catching the query that skipped it.

Deferring it is safe because it is additive: the policy template is pure DDL, and
policies are per-table, so tables can be tightened one at a time behind
`using (true)`. What is *not* additive is the credential switch, which is a
single global flip — every table without a correct policy goes dark at once.

## Consequences

The deferral is cheap **only if the helper is the sole construction site**. One
migration and one file, or a re-audit of 406 `.from(` call sites — and the second
never happens. Spec B therefore carries three mechanical done-criteria:

1. zero `getSupabaseServiceRole()` / `getSupabase()` call sites outside the
   helper file;
2. zero `.from(` call sites outside the helper file;
3. `dependency-cruiser` wired into an npm script and CI over `src/**`.

Criterion 3 is not housekeeping. dependency-cruiser is **not a gate today**:
there is no npm script and no CI workflow, and it runs only from a Claude Code
hook scoped to `src/modules/<module>` (`.claude/hooks/run-checks.mjs:55`). It
never sees `src/services`, where 192 of the 406 `.from(` calls live. §2.6's ban
on raw `.from()` cannot be enforced by it as configured.

Accepted risk for the duration: with app-level scoping alone, one adapter that
slips past the lint is an unguarded leak. This cannot bite while one organization
exists, which is the whole window in which it holds.

Org-claim RLS and storage-path prefixing become their own spec, joining spec A's
six deferred items behind the same hard gate: **no second `organizations` row
until they land.**

Related: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §2.6, §6 item 3;
`.scratch/org-location-foundation/issues/05-rls-inventory.md`.
