-- Base Organizacional 1.0 — ticket 04 "Calendário & Eventos + Feriados"
-- (.scratch/base-organizacional, decisões D5 e D6).
--
-- 1) Feriados: evolui a tabela existente `hr_public_holidays` (a mesma que
--    as Escalas e o legacy de Férias já leem — nunca uma estrutura
--    paralela). Ganha `type` (national|municipal|custom) e `location_id`
--    (NULL = empresa inteira). A unicidade passa de (org_id, date) para a
--    chave da task: tenant + data + tipo + âmbito/local.
--    D6: Escalas/Férias continuam a considerar só feriados da empresa
--    inteira (`location_id IS NULL`) — filtrado no código.
--    Compatibilidade: o legacy (`hrLeaveService`) só envia `is_national`; um
--    trigger preenche `type` quando vem vazio, e `is_national` acompanha
--    sempre `type = 'national'` nas escritas novas.
-- 2) Eventos empresariais (`company_events`) — informativos, nunca alteram
--    escalas/férias/assiduidade/remuneração. Cancelar, nunca apagar.
-- 3) Auditoria própria do módulo (`calendar_audit_logs`, D3).
--
-- Reexecutável.

-- ── 1) Feriados ───────────────────────────────────────────────────────────

alter table public.hr_public_holidays
  add column if not exists type text,
  add column if not exists location_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.hr_public_holidays
set type = case when is_national then 'national' else 'custom' end
where type is null;

create or replace function public.hr_public_holidays_default_type()
returns trigger
language plpgsql
as $$
begin
  if new.type is null then
    new.type := case when new.is_national then 'national' else 'custom' end;
  end if;
  return new;
end;
$$;

drop trigger if exists hr_public_holidays_default_type on public.hr_public_holidays;
create trigger hr_public_holidays_default_type
  before insert on public.hr_public_holidays
  for each row execute function public.hr_public_holidays_default_type();

alter table public.hr_public_holidays
  alter column type set not null;

alter table public.hr_public_holidays
  drop constraint if exists hr_public_holidays_type_check;
alter table public.hr_public_holidays
  add constraint hr_public_holidays_type_check check (type in ('national', 'municipal', 'custom'));

alter table public.hr_public_holidays
  drop constraint if exists hr_public_holidays_org_id_location_id_fkey;
alter table public.hr_public_holidays
  add constraint hr_public_holidays_org_id_location_id_fkey
  foreign key (org_id, location_id) references public.locations (org_id, id);

-- Deduplicação (task §6): tenant + data + tipo + âmbito (empresa = sem local).
alter table public.hr_public_holidays
  drop constraint if exists hr_public_holidays_org_id_date_key;
create unique index if not exists hr_public_holidays_dedupe_idx
  on public.hr_public_holidays (org_id, date, type, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── 2) Eventos empresariais ───────────────────────────────────────────────

create table if not exists public.company_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  title text not null check (length(btrim(title)) > 0),
  date date not null,
  all_day boolean not null default true,
  start_time time,
  end_time time,
  description text,
  category text not null,
  location_id uuid,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'critical')),
  responsible text,
  visibility text not null default 'all' check (visibility in ('all', 'management')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_events_org_id_location_id_fkey foreign key (org_id, location_id) references public.locations (org_id, id),
  constraint company_events_time_check check (all_day or start_time is not null)
);

create index if not exists company_events_org_date_idx on public.company_events (org_id, date);

alter table public.company_events enable row level security;

drop policy if exists "company_events: org-scoped all" on public.company_events;
create policy "company_events: org-scoped all"
  on public.company_events
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- ── 3) Auditoria ──────────────────────────────────────────────────────────

create table if not exists public.calendar_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('holiday', 'company_event')),
  entity_id uuid not null,
  action text not null,
  actor text not null,
  payload_before jsonb,
  payload_after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists calendar_audit_logs_entity_idx
  on public.calendar_audit_logs (org_id, entity_type, entity_id, created_at);

alter table public.calendar_audit_logs enable row level security;

drop policy if exists "calendar_audit_logs: org-scoped all" on public.calendar_audit_logs;
create policy "calendar_audit_logs: org-scoped all"
  on public.calendar_audit_logs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
