-- Módulo Contabilidade — "Documento" (generaliza a versão anterior,
-- "despesa de sócio/plataforma", para qualquer documento contabilístico/
-- fiscal sem fluxo bancário normal da empresa: fatura paga por sócio/
-- funcionário, comissão de plataforma, nota de crédito fora do fluxo
-- normal, documento manual, regularização, outro). Nunca confundir com
-- uma fatura normal (tabela `invoices`, módulo `invoices`) — "Documentos"
-- é sempre uma vista agregada + este único tipo novo, nunca um CRUD
-- paralelo de faturas.

create table if not exists public.accounting_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document_type text not null check (document_type in (
    'partner_invoice', 'employee_invoice', 'platform_commission',
    'credit_note', 'manual', 'regularization', 'other'
  )),
  funding_source text not null check (funding_source in ('partner', 'employee', 'platform', 'other')),
  entity_name text not null,
  nif text,
  document_number text,
  issue_date date not null,
  received_date date,
  competence_date date,
  currency text not null default 'EUR',
  country text not null default 'PT',
  subtotal_without_vat integer not null,
  vat_amount integer not null,
  total_with_vat integer not null,
  cost_center_category_id uuid references public.cost_center_categories(id),
  -- Dedutibilidade — nunca decidida sozinha pela subcategoria: `null` usa
  -- a sugestão de `cost_center_categories.vat_deductible` (100 ou 0);
  -- só quando o gestor diverge explicitamente é que grava um valor aqui
  -- e é obrigado a justificar (constraint abaixo).
  deductible_percentage integer check (deductible_percentage between 0 and 100),
  deductibility_override_reason text,
  vat_deductible_amount integer not null default 0,
  vat_non_deductible_amount integer not null default 0,
  settlement_method text not null check (settlement_method in ('reimbursement', 'partner_current_account', 'other')),
  status text not null default 'pending_review' check (status in (
    'pending_review', 'validated', 'with_pendency', 'closed', 'cancelled'
  )),
  cancellation_reason text,
  notes text,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accounting_documents_override_requires_reason check (
    deductible_percentage is null or deductibility_override_reason is not null
  )
);

create index if not exists accounting_documents_org_issue_date_idx
  on public.accounting_documents (org_id, issue_date);
create index if not exists accounting_documents_org_nif_number_idx
  on public.accounting_documents (org_id, nif, document_number);

alter table public.accounting_documents enable row level security;

create policy "accounting_documents: org-scoped all"
  on public.accounting_documents
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Anexo versionado (secção 16 da task) — cada upload é uma linha nova,
-- nunca substitui/apaga uma versão anterior.
create table if not exists public.accounting_document_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document_id uuid not null references public.accounting_documents(id),
  storage_path text not null,
  file_type text not null,
  file_hash text not null,
  version integer not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists accounting_document_attachments_document_idx
  on public.accounting_document_attachments (document_id, version);

alter table public.accounting_document_attachments enable row level security;

create policy "accounting_document_attachments: org-scoped all"
  on public.accounting_document_attachments
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Bucket privado para os anexos — nunca público, URL sempre assinada on-demand.
insert into storage.buckets (id, name, public)
values ('accounting-documents', 'accounting-documents', false)
on conflict (id) do nothing;

create policy "accounting-documents: org-scoped select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'accounting-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "accounting-documents: org-scoped insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'accounting-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "accounting-documents: org-scoped update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'accounting-documents'
    and (storage.foldername(name))[1] = current_org()::text
  )
  with check (
    bucket_id = 'accounting-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "accounting-documents: org-scoped delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'accounting-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );
