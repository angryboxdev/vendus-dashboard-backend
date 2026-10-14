-- Fornecedores/Financeiro/Stock v1.2 · F1 §1.4: versão (bloqueio otimista) e auditoria das faturas.
-- Sem efeitos retroativos: as faturas existentes começam na versão 1 e sem histórico (a auditoria
-- regista a partir daqui). A tabela de auditoria só aceita inserção/leitura (sem update/delete).

alter table public.invoices
  add column if not exists version integer not null default 1;

create table if not exists public.invoice_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  -- Sem FK para invoices: o registo sobrevive à eliminação da fatura.
  invoice_id uuid not null,
  action text not null check (action in ('create', 'confirm', 'update', 'delete')),
  actor text not null,
  origin text not null check (origin in ('manual', 'import', 'system')),
  reason text null,
  before jsonb null,
  after jsonb null,
  created_at timestamptz not null default now(),
  constraint invoice_audit_logs_org_id_uq unique (org_id, id)
);
create index if not exists invoice_audit_logs_invoice_idx on public.invoice_audit_logs (org_id, invoice_id, created_at);

alter table public.invoice_audit_logs enable row level security;
drop policy if exists "invoice_audit_logs: org-scoped select" on public.invoice_audit_logs;
create policy "invoice_audit_logs: org-scoped select" on public.invoice_audit_logs for select to authenticated using (org_id = current_org());
drop policy if exists "invoice_audit_logs: org-scoped insert" on public.invoice_audit_logs;
create policy "invoice_audit_logs: org-scoped insert" on public.invoice_audit_logs for insert to authenticated with check (org_id = current_org());
