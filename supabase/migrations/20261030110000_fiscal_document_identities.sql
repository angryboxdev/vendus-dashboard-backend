-- Fornecedores/Financeiro/Stock v1.2 · F1: identidade fiscal partilhada.
-- Um documento real (fatura/NC) tem UMA identidade, venha do Financeiro ou do
-- Stock. A unicidade vive nesta tabela nova — não se impõe nenhuma restrição
-- às faturas/importações históricas (o histórico entra por backfill com
-- simulação; duplicados históricos vão para relatório, nunca são fundidos).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.fiscal_document_identities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  -- Entidade compradora: id da entidade legal, ou 'org' quando não há entidade escolhida.
  buyer_key text not null check (length(buyer_key) between 3 and 64),
  legal_entity_id uuid null,
  issuer_country text not null check (issuer_country ~ '^[A-Z]{2}$'),
  issuer_tax_id text not null check (length(issuer_tax_id) between 2 and 32),
  document_type text not null check (document_type in ('invoice', 'credit_note')),
  -- Texto original preservado; a forma normalizada só serve para comparar.
  series_number text not null check (length(btrim(series_number)) between 1 and 120),
  series_number_norm text not null check (length(series_number_norm) between 1 and 120),
  number_digits text not null default '',
  atcud text null,
  first_origin text not null check (first_origin in ('finance', 'stock')),
  invoice_id uuid null,
  stock_import_id uuid null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_document_identities_org_id_uq unique (org_id, id),
  constraint fiscal_document_identities_key_uq unique (org_id, buyer_key, issuer_country, issuer_tax_id, document_type, series_number_norm),
  constraint fiscal_document_identities_invoice_uq unique (org_id, invoice_id),
  constraint fiscal_document_identities_stock_import_uq unique (org_id, stock_import_id),
  constraint fiscal_document_identities_invoice_fk foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete set null (invoice_id),
  constraint fiscal_document_identities_stock_import_fk foreign key (org_id, stock_import_id) references public.supplier_invoice_imports (org_id, id) on delete set null (stock_import_id)
);

create index if not exists fiscal_document_identities_similar_idx
  on public.fiscal_document_identities (org_id, issuer_country, issuer_tax_id, document_type, number_digits);

alter table public.fiscal_document_identities enable row level security;
drop policy if exists "fiscal_document_identities: org-scoped all" on public.fiscal_document_identities;
create policy "fiscal_document_identities: org-scoped all" on public.fiscal_document_identities for all to authenticated using (org_id = current_org()) with check (org_id = current_org());

-- Auditoria das identidades (quem, origem, antes/depois). Só acrescenta.
create table if not exists public.fiscal_document_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  identity_id uuid not null,
  actor text not null,
  action text not null,
  origin text not null check (origin in ('finance', 'stock', 'backfill')),
  before jsonb null,
  after jsonb null,
  created_at timestamptz not null default now(),
  constraint fiscal_document_audit_logs_org_id_uq unique (org_id, id)
);
create index if not exists fiscal_document_audit_logs_identity_idx on public.fiscal_document_audit_logs (org_id, identity_id, created_at);

alter table public.fiscal_document_audit_logs enable row level security;
drop policy if exists "fiscal_document_audit_logs: org-scoped all" on public.fiscal_document_audit_logs;
create policy "fiscal_document_audit_logs: org-scoped all" on public.fiscal_document_audit_logs for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
