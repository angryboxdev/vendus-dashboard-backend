-- Módulo financial-base — Calendário de entrega de fornecedor (novo,
-- consumido pelo módulo Stock — Planeamento via D10). Puramente
-- informativo, nunca um compromisso/SLA rastreado (secção 5 da task de
-- Planeamento). Mesmo padrão já estabelecido nesta sessão.
create table if not exists public.supplier_delivery_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id),
  location_id uuid not null references public.locations(id),
  -- ISO weekday, 1=Segunda … 7=Domingo; null/vazio = sem calendário configurado.
  weekdays integer[],
  cutoff_time time,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint supplier_delivery_schedules_unique unique (org_id, supplier_id, location_id)
);

create index if not exists supplier_delivery_schedules_supplier_idx on public.supplier_delivery_schedules (org_id, supplier_id);

alter table public.supplier_delivery_schedules enable row level security;

drop policy if exists "supplier_delivery_schedules: org-scoped all" on public.supplier_delivery_schedules;
create policy "supplier_delivery_schedules: org-scoped all"
  on public.supplier_delivery_schedules
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
