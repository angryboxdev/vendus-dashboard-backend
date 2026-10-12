-- Novo RH — Fase 9: comunicados (destinatários congelados, recibos por
-- versão), alertas (regras, dono, SLA, escalonamento), solicitações
-- personalizadas e tarefas operacionais (ADR-0033). Só objetos novos.
-- Rollback em docs/migrations/rollback/.

-- ── Comunicados ───────────────────────────────────────────────────────
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- { "type": "all" | "locations" | "groups" | "employees", "ids": [...] }
  audience jsonb not null,
  requires_confirmation boolean not null default false,
  current_version integer not null default 1,
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(body) <= 20000),
  published_at timestamptz,
  published_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint announcements_org_id_uq unique (org_id, id)
);

create table if not exists public.announcement_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  announcement_id uuid not null,
  version integer not null,
  title text not null,
  body text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint announcement_versions_uq unique (org_id, announcement_id, version),
  constraint announcement_versions_fk foreign key (org_id, announcement_id) references public.announcements (org_id, id)
);

-- Destinatários congelados na publicação (RE-31).
create table if not exists public.announcement_recipients (
  org_id uuid not null references public.organizations(id),
  announcement_id uuid not null,
  employee_id uuid not null,
  user_id text,
  primary key (org_id, announcement_id, employee_id),
  constraint announcement_recipients_fk foreign key (org_id, announcement_id) references public.announcements (org_id, id),
  constraint announcement_recipients_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);

-- Entregue / lido / confirmado por versão (RE-32).
create table if not exists public.announcement_receipts (
  org_id uuid not null references public.organizations(id),
  announcement_id uuid not null,
  version integer not null,
  employee_id uuid not null,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  confirmed_at timestamptz,
  primary key (org_id, announcement_id, version, employee_id),
  constraint announcement_receipts_fk foreign key (org_id, announcement_id) references public.announcements (org_id, id)
);

create or replace function public.guard_announcement_audience() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' and new.audience is distinct from old.audience then
    raise exception 'announcements: os destinatários não mudam depois de publicar';
  end if;
  return new;
end;
$$;
drop trigger if exists announcements_audience_guard on public.announcements;
create trigger announcements_audience_guard before update on public.announcements
  for each row execute function public.guard_announcement_audience();
drop trigger if exists announcement_versions_append_only on public.announcement_versions;
create trigger announcement_versions_append_only before update or delete on public.announcement_versions
  for each row execute function public.forbid_append_only_changes();

-- ── Alertas ───────────────────────────────────────────────────────────
create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('pending_absence', 'pending_correction', 'pending_reopening', 'pending_swap', 'pending_custom_request', 'contract_end', 'probation_end', 'overdue_task')),
  threshold_days integer not null check (threshold_days between 0 and 365),
  -- "admins" | "profile:<uuid>" | "user:<id>"
  owner text not null,
  sla_hours integer not null check (sla_hours between 1 and 2160),
  escalate_to text,
  enabled boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint alert_rules_org_id_uq unique (org_id, id)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  rule_id uuid not null,
  source_type text not null,
  source_id text not null,
  employee_id uuid,
  title text not null,
  owner_user_ids jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  due_at timestamptz not null,
  escalated_at timestamptz,
  escalated_to jsonb,
  taken_by text,
  closed_by text,
  closed_at timestamptz,
  close_note text,
  created_at timestamptz not null default now(),
  constraint alerts_rule_fk foreign key (org_id, rule_id) references public.alert_rules (org_id, id)
);
-- Um alerta aberto por origem e regra (sem duplicados).
create unique index if not exists alerts_open_source_uq on public.alerts (org_id, rule_id, source_type, source_id) where status <> 'closed';
create index if not exists alerts_status_idx on public.alerts (org_id, status, due_at);

-- ── Solicitações personalizadas (C6.3) ────────────────────────────────
create table if not exists public.custom_request_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  title text not null check (length(btrim(title)) between 1 and 120),
  response_days integer check (response_days is null or response_days between 1 and 365),
  -- [{ "id", "title", "type": "single" | "multiple" | "text", "options": [], "required" }] (máx. 50)
  fields jsonb not null check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) between 1 and 50),
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint custom_request_forms_org_id_uq unique (org_id, id)
);

create table if not exists public.custom_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  form_id uuid not null,
  employee_id uuid not null,
  requested_by_user_id text not null,
  answers jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  due_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  decision_comment text,
  created_at timestamptz not null default now(),
  constraint custom_requests_form_fk foreign key (org_id, form_id) references public.custom_request_forms (org_id, id),
  constraint custom_requests_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);

-- ── Tarefas operacionais ──────────────────────────────────────────────
create table if not exists public.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text,
  assignee_employee_id uuid,
  location_id uuid,
  due_at timestamptz,
  -- [{ "id", "text", "required", "done", "doneBy", "doneAt" }]
  checklist jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_by text,
  completed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint ops_tasks_employee_fk foreign key (org_id, assignee_employee_id) references public.hr_employees (org_id, id)
);
create index if not exists ops_tasks_status_idx on public.ops_tasks (org_id, status, due_at);

alter table public.announcements enable row level security;
alter table public.announcement_versions enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.announcement_receipts enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alerts enable row level security;
alter table public.custom_request_forms enable row level security;
alter table public.custom_requests enable row level security;
alter table public.ops_tasks enable row level security;

drop policy if exists "announcements: org-scoped all" on public.announcements;
create policy "announcements: org-scoped all" on public.announcements for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "announcement_versions: org-scoped all" on public.announcement_versions;
create policy "announcement_versions: org-scoped all" on public.announcement_versions for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "announcement_recipients: org-scoped all" on public.announcement_recipients;
create policy "announcement_recipients: org-scoped all" on public.announcement_recipients for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "announcement_receipts: org-scoped all" on public.announcement_receipts;
create policy "announcement_receipts: org-scoped all" on public.announcement_receipts for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "alert_rules: org-scoped all" on public.alert_rules;
create policy "alert_rules: org-scoped all" on public.alert_rules for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "alerts: org-scoped all" on public.alerts;
create policy "alerts: org-scoped all" on public.alerts for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "custom_request_forms: org-scoped all" on public.custom_request_forms;
create policy "custom_request_forms: org-scoped all" on public.custom_request_forms for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "custom_requests: org-scoped all" on public.custom_requests;
create policy "custom_requests: org-scoped all" on public.custom_requests for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "ops_tasks: org-scoped all" on public.ops_tasks;
create policy "ops_tasks: org-scoped all" on public.ops_tasks for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
