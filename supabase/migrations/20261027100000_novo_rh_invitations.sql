-- Novo RH (FE-054): convites (código/link) e pedidos de adesão. O código em
-- claro nunca é guardado — só o hash (único) e os últimos 4 caracteres. O
-- pedido só tem nome, apelidos e e-mail (minimização RGPD).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint text not null check (length(code_hint) = 4),
  location_id uuid,
  department_id uuid,
  max_uses integer check (max_uses is null or max_uses between 1 and 500),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint invitations_org_id_uq unique (org_id, id),
  constraint invitations_code_hash_uq unique (code_hash),
  constraint invitations_uses_ck check (max_uses is null or uses <= max_uses),
  constraint invitations_location_fk foreign key (org_id, location_id) references public.locations (org_id, id)
);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  invitation_id uuid not null,
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null check (length(btrim(last_name)) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  possible_duplicate boolean not null default false,
  reject_reason text,
  decided_by text,
  decided_at timestamptz,
  employee_id uuid,
  created_at timestamptz not null default now(),
  constraint join_requests_invitation_fk foreign key (org_id, invitation_id) references public.invitations (org_id, id),
  constraint join_requests_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint join_requests_reject_ck check (status <> 'rejected' or reject_reason is not null)
);
create index if not exists join_requests_status_idx on public.join_requests (org_id, status, created_at desc);

alter table public.invitations enable row level security;
alter table public.join_requests enable row level security;
drop policy if exists "invitations: org-scoped all" on public.invitations;
create policy "invitations: org-scoped all" on public.invitations for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "join_requests: org-scoped all" on public.join_requests;
create policy "join_requests: org-scoped all" on public.join_requests for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
