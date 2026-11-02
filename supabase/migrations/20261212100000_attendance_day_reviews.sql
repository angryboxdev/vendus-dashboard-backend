-- Assiduidade V2 — decisão de conferência por dia (ADR-0043).
-- A picagem original (clock_events) e a escala publicada não mudam; aqui fica
-- quem confirmou o quê, com que abrangência e motivo, e o tempo validado que o
-- motor passa a usar nesse dia. Uma decisão ativa por (colaborador, dia):
-- anular deixa o registo (voided_*) e permite nova decisão. Idempotente.

create table if not exists public.attendance_day_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  work_date date not null,
  decision text not null check (decision in ('fulfilled', 'keep', 'manual', 'absence')),
  -- Segundos validados (null = mantém os calculados a partir das picagens).
  validated_seconds integer check (validated_seconds is null or validated_seconds >= 0),
  -- Fotografia do momento da decisão (reconstruir a vista anterior).
  before_seconds integer not null,
  theoretical_seconds integer not null,
  planned_ranges jsonb,
  manual jsonb,
  absence_type text,
  reason text not null check (char_length(reason) between 1 and 500),
  scope text not null check (scope in ('day', 'selected', 'week')),
  batch_id uuid,
  day_version integer,
  created_by text not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  constraint attendance_day_reviews_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);

-- Concorrência: dois gestores no mesmo dia → só uma decisão ativa.
create unique index if not exists attendance_day_reviews_active_uq
  on public.attendance_day_reviews (org_id, employee_id, work_date) where voided_at is null;
create index if not exists attendance_day_reviews_batch_idx on public.attendance_day_reviews (org_id, batch_id) where batch_id is not null;

alter table public.attendance_day_reviews enable row level security;
drop policy if exists "attendance_day_reviews: org-scoped all" on public.attendance_day_reviews;
create policy "attendance_day_reviews: org-scoped all" on public.attendance_day_reviews for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
