-- org_members: the membership record that replaces app_users.role as the
-- carrier of what a person may do. A role is no longer a global property of
-- a person -- it is something someone holds *within* an organization
-- (ADR-0003). See .scratch/tenant-identity/spec.md D4, D5, D9 and issue 02.
--
-- app_users is NOT dropped here. This is the expand half of expand-contract:
-- between this migration and issue 03 shipping, the back end looks for the
-- new `org_role` claim, does not find it on tokens minted before the hook
-- below deploys, and falls back to its existing app_users lookup. Dropping
-- the table now would turn that window into a total lockout instead of a
-- silent, working fallback. It is dropped in issue 06, once nothing reads
-- it.
--
-- RLS is enabled with zero policies, matching organizations and locations
-- (20260822143602_tenant_root_tables.sql) -- deny-by-default until spec B2
-- adds membership-based policies.

create table org_members (
  org_id     uuid not null references organizations (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'manager', 'hr_viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table org_members enable row level security;

-- Backfill: one membership per existing app_users row, into Angrybox (the
-- one organization that exists as of this migration, seeded with this fixed
-- id in 20260822143602_tenant_root_tables.sql), carrying that row's role.
insert into org_members (org_id, user_id, role)
select 'b6999cff-79b2-4583-b8b4-a744b3ace748', id, role
from app_users;

-- The hook runs as supabase_auth_admin, and issue 02's brief calls for an
-- explicit read grant so a missing one fails loudly rather than presenting
-- as a lockout. Verified against the local stack: in this migration, the
-- grant is not actually load-bearing -- the function below is `security
-- definer`, owned by postgres, which already owns org_members outright, so
-- the internal SELECT succeeds with or without this grant. It is added
-- anyway: it is what the ticket asks for, it matches the existing precedent
-- on app_users (already granted to supabase_auth_admin in the baseline), it
-- is what Supabase's own hook documentation directs, and it stops being a
-- no-op the moment anyone changes the function's owner or drops `security
-- definer`. See issue 02's Comments for the verification that established
-- this.
grant select on org_members to supabase_auth_admin;

-- Rewrite the token hook: read org_members instead of app_users, and inject
-- org_id and org_role instead of app_role. org_role replaces app_role
-- because a claim name asserting a global fact while holding an org-scoped
-- one is worse than a rename (D9).
--
-- The rule is exactly one membership, or no claims at all -- zero and two
-- are treated identically (D5), including the case of the same person
-- holding *different* roles in two organizations: counting memberships,
-- rather than trying to pick one, is what makes that case fall out for
-- free. The system never answers a request against a guessed tenant.
create or replace function public.custom_access_token_hook (
  event jsonb
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
  AS $function$
DECLARE
  claims       jsonb;
  member_count int;
  member_org   uuid;
  member_role  text;
BEGIN
  SELECT count(*), (array_agg(org_id))[1], (array_agg(role))[1]
  INTO member_count, member_org, member_role
  FROM public.org_members
  WHERE user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF member_count = 1 THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(member_org));
    claims := jsonb_set(claims, '{org_role}', to_jsonb(member_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$function$;
