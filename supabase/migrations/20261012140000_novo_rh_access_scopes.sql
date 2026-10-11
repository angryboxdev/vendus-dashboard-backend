-- Novo RH — Fase 1, ticket 05: tipo de perfil (Geral/Específico), âmbitos com
-- vigência e privacidade por campo (Configurações C3.6; Eng. Reversa 9.2, 13.1
-- `role_assignment`, `field_privacy_rule`). Só acrescenta (coluna com default
-- e tabelas novas). Rollback em docs/migrations/rollback/.

-- Geral = gere toda a empresa; Específico = só o que os seus âmbitos cobrem.
alter table public.access_profiles
  add column if not exists scope_kind text not null default 'general';
alter table public.access_profiles drop constraint if exists access_profiles_scope_kind_ck;
alter table public.access_profiles
  add constraint access_profiles_scope_kind_ck check (scope_kind in ('general', 'specific'));

-- Âmbitos de um utilizador (perfil Específico): centro, departamento, grupo ou o próprio.
create table if not exists public.access_scopes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  user_id uuid not null,
  scope_type text not null check (scope_type in ('location', 'department', 'group', 'self')),
  scope_id uuid,
  valid_from date not null,
  valid_to date,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint access_scopes_target_ck check ((scope_type = 'self') = (scope_id is null)),
  constraint access_scopes_period_ck check (valid_to is null or valid_to >= valid_from),
  constraint access_scopes_member_fk foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);
create index if not exists access_scopes_org_user_idx on public.access_scopes (org_id, user_id);

-- Privacidade por campo, por perfil (ausente = regra por omissão do catálogo em código).
create table if not exists public.access_field_privacy (
  org_id uuid not null references public.organizations(id),
  profile_id uuid not null,
  field_key text not null check (field_key ~ '^[a-z_.]{2,60}$'),
  can_view boolean not null,
  can_edit boolean not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, profile_id, field_key),
  constraint access_field_privacy_edit_needs_view check (not can_edit or can_view),
  constraint access_field_privacy_profile_fk foreign key (org_id, profile_id) references public.access_profiles (org_id, id) on delete cascade
);

alter table public.access_scopes enable row level security;
alter table public.access_field_privacy enable row level security;
drop policy if exists "access_scopes: org-scoped all" on public.access_scopes;
create policy "access_scopes: org-scoped all" on public.access_scopes for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "access_field_privacy: org-scoped all" on public.access_field_privacy;
create policy "access_field_privacy: org-scoped all" on public.access_field_privacy for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
