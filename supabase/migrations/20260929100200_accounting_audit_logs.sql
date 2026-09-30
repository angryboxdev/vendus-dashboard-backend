-- Auditoria do módulo Contabilidade (secção 17 da task) — só para
-- `AccountingDocument` nesta ronda; `invoices` já tem o seu próprio
-- mecanismo de histórico, separado. Mesma forma de `hr_audit_logs`
-- (módulo `hr`) — nunca reaproveita essa tabela (entity_type/contexto
-- diferentes, evita colisão de vocabulário entre módulos).

create table if not exists public.accounting_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('accounting_document')),
  entity_id uuid not null,
  action text not null,
  actor text not null,
  payload_before jsonb,
  payload_after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists accounting_audit_logs_entity_idx
  on public.accounting_audit_logs (org_id, entity_type, entity_id, created_at);

alter table public.accounting_audit_logs enable row level security;

-- `drop policy if exists` antes de `create policy` (Postgres não tem
-- `create policy if not exists`) — torna a migration reexecutável.
drop policy if exists "accounting_audit_logs: org-scoped all" on public.accounting_audit_logs;
create policy "accounting_audit_logs: org-scoped all"
  on public.accounting_audit_logs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
