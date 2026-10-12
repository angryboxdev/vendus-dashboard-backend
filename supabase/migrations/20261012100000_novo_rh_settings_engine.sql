-- Novo RH — Fase 1, ticket 02: motor de configurações (Configurações C11)
-- e store persistente de Idempotency-Key (ADR-0022).
-- Só cria tabelas novas; rollback em docs/migrations/rollback/20261012100000_novo_rh_settings_engine.sql.

-- ── Perfis ─────────────────────────────────────────────────────────────
create table if not exists public.setting_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  domain text not null check (domain in ('security', 'time_tracking', 'notifications')),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('global', 'segment', 'personal')),
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint setting_profiles_org_id_id_key unique (org_id, id)
);
-- Nomes únicos por organização e domínio (CF-13 no espírito); uma só global por domínio.
create unique index if not exists setting_profiles_name_uq
  on public.setting_profiles (org_id, domain, lower(btrim(name))) where not archived;
create unique index if not exists setting_profiles_global_uq
  on public.setting_profiles (org_id, domain) where kind = 'global' and not archived;

-- ── Alvos (com vigência) ───────────────────────────────────────────────
create table if not exists public.setting_profile_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  profile_id uuid not null,
  target_type text not null check (target_type in ('employee', 'group', 'department', 'location')),
  target_id uuid not null,
  valid_from date not null,
  valid_to date,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint setting_profile_targets_period_ck check (valid_to is null or valid_to >= valid_from),
  constraint setting_profile_targets_profile_fk foreign key (org_id, profile_id) references public.setting_profiles (org_id, id)
);
create index if not exists setting_profile_targets_org_profile_idx on public.setting_profile_targets (org_id, profile_id);
create index if not exists setting_profile_targets_org_target_idx on public.setting_profile_targets (org_id, target_type, target_id);

-- ── Valores (append-only) ──────────────────────────────────────────────
create table if not exists public.setting_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  profile_id uuid not null,
  key text not null check (length(key) between 1 and 120),
  -- null = o perfil deixa de definir a chave (passa a herdar).
  value jsonb,
  valid_from date not null,
  reason text not null check (length(btrim(reason)) > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint setting_values_profile_fk foreign key (org_id, profile_id) references public.setting_profiles (org_id, id)
);
create index if not exists setting_values_org_profile_key_idx on public.setting_values (org_id, profile_id, key, valid_from);

-- Append-only: valores nunca se alteram nem apagam; alvos só podem ganhar/alterar o fim da vigência.
create or replace function public.forbid_setting_value_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'setting_values é append-only: crie um novo valor com data de efeito e motivo';
end;
$$;

drop trigger if exists setting_values_append_only on public.setting_values;
create trigger setting_values_append_only
  before update or delete on public.setting_values
  for each row execute function public.forbid_setting_value_changes();

create or replace function public.guard_setting_target_changes() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'setting_profile_targets não se apagam: termine a vigência (valid_to)';
  end if;
  if (new.org_id, new.profile_id, new.target_type, new.target_id, new.valid_from, new.created_by, new.created_at)
     is distinct from (old.org_id, old.profile_id, old.target_type, old.target_id, old.valid_from, old.created_by, old.created_at) then
    raise exception 'setting_profile_targets: só a data de fim (valid_to) pode mudar';
  end if;
  return new;
end;
$$;

drop trigger if exists setting_profile_targets_guard on public.setting_profile_targets;
create trigger setting_profile_targets_guard
  before update or delete on public.setting_profile_targets
  for each row execute function public.guard_setting_target_changes();

-- ── Idempotency-Key persistente (ADR-0022) ─────────────────────────────
create table if not exists public.http_idempotency_keys (
  org_id uuid not null references public.organizations(id),
  scope text not null check (length(scope) between 1 and 1024),
  fingerprint text not null,
  status integer,
  headers jsonb not null default '{}'::jsonb,
  body text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (org_id, scope)
);
create index if not exists http_idempotency_keys_expires_idx on public.http_idempotency_keys (expires_at);

-- ── RLS org-claim (ADR-0020) ───────────────────────────────────────────
alter table public.setting_profiles enable row level security;
alter table public.setting_profile_targets enable row level security;
alter table public.setting_values enable row level security;
alter table public.http_idempotency_keys enable row level security;

drop policy if exists "setting_profiles: org-scoped all" on public.setting_profiles;
create policy "setting_profiles: org-scoped all" on public.setting_profiles
  for all to authenticated using (org_id = current_org()) with check (org_id = current_org());

drop policy if exists "setting_profile_targets: org-scoped all" on public.setting_profile_targets;
create policy "setting_profile_targets: org-scoped all" on public.setting_profile_targets
  for all to authenticated using (org_id = current_org()) with check (org_id = current_org());

drop policy if exists "setting_values: org-scoped read" on public.setting_values;
create policy "setting_values: org-scoped read" on public.setting_values
  for select to authenticated using (org_id = current_org());
drop policy if exists "setting_values: org-scoped insert" on public.setting_values;
create policy "setting_values: org-scoped insert" on public.setting_values
  for insert to authenticated with check (org_id = current_org());

drop policy if exists "http_idempotency_keys: org-scoped all" on public.http_idempotency_keys;
create policy "http_idempotency_keys: org-scoped all" on public.http_idempotency_keys
  for all to authenticated using (org_id = current_org()) with check (org_id = current_org());

-- ── Catálogo de acessos: módulo "Configurações & Auditoria" ────────────
-- Perfil de sistema Admin recebe as chaves novas (os outros perfis ficam sem acesso).
-- O teste access-catalog.test.ts lê esta linha (formato: system_key + jsonb).
update public.access_profiles
   set permissions = permissions || '{"governance.settings": "MANAGE", "governance.audit": "MANAGE", "governance.settings_retroactive": "MANAGE"}'::jsonb,
       version = version + 1,
       updated_at = now()
 where system_key = 'admin';
