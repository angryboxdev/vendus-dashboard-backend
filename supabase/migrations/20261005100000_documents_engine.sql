-- Base Organizacional 1.0 — ticket 03 "Motor de documentos"
-- (.scratch/base-organizacional, decisões D2, D9, D10, D11).
--
-- Um único motor documental para Empresa e Colaborador sobre as tabelas já
-- existentes (D9: generalizar sem renomear — o backend em produção e o
-- código legacy `hrDocumentService` continuam a funcionar antes do deploy
-- novo; o prefixo `hr_` fica como dívida documentada).
--
-- Dono do documento:
--   owner_type = 'employee' → employee_id preenchido (FK composta já
--                              existente) — é o caso de todas as linhas atuais
--                              e o default, por isso os inserts legacy não mudam;
--   owner_type = 'company'  → employee_id NULL; o dono é a própria
--                              organização (`org_id`, CONTEXT.md: Organization).
-- Uma leitura por colaborador (`employee_id = …`) nunca devolve documentos da
-- Empresa — inclusive no legacy.
--
-- Tudo aditivo e reexecutável. Nenhum dado existente é alterado, exceto o
-- âmbito da categoria "Apólice de seguro de acidentes de trabalho" (D10).

-- ── Documentos ────────────────────────────────────────────────────────────

alter table public.hr_employee_documents
  add column if not exists owner_type text not null default 'employee',
  add column if not exists issued_at date,
  add column if not exists visibility text;

alter table public.hr_employee_documents
  alter column employee_id drop not null;

alter table public.hr_employee_documents
  drop constraint if exists hr_employee_documents_owner_type_check;
alter table public.hr_employee_documents
  add constraint hr_employee_documents_owner_type_check check (owner_type in ('employee', 'company'));

-- Dono coerente: colaborador ⇔ employee_id preenchido.
alter table public.hr_employee_documents
  drop constraint if exists hr_employee_documents_owner_consistency_check;
alter table public.hr_employee_documents
  add constraint hr_employee_documents_owner_consistency_check check (
    (owner_type = 'employee' and employee_id is not null)
    or (owner_type = 'company' and employee_id is null)
  );

-- D11: visibilidade só se aplica a documentos da Empresa.
alter table public.hr_employee_documents
  drop constraint if exists hr_employee_documents_visibility_check;
alter table public.hr_employee_documents
  add constraint hr_employee_documents_visibility_check check (
    (owner_type = 'company' and visibility in ('management', 'admin'))
    or (owner_type = 'employee' and visibility is null)
  );

create index if not exists hr_employee_documents_org_owner_current_idx
  on public.hr_employee_documents (org_id, owner_type, is_current);

-- ── Categorias: âmbito ────────────────────────────────────────────────────

alter table public.hr_document_categories
  add column if not exists scope text not null default 'employee';

alter table public.hr_document_categories
  drop constraint if exists hr_document_categories_scope_check;
alter table public.hr_document_categories
  add constraint hr_document_categories_scope_check check (scope in ('employee', 'company', 'both'));

-- D10 (decisão do utilizador, 2026-10-05): a apólice existe na empresa e por
-- colaborador. Só esta categoria muda; as restantes ficam "Colaborador".
update public.hr_document_categories
set scope = 'both', updated_at = now()
where slug = 'apolice_seguro_at' and scope = 'employee';

-- ── Auditoria dos documentos da Empresa (D3: tabela própria do módulo) ────
-- Os documentos de colaborador continuam a ser auditados em `hr_audit_logs`
-- (histórico do colaborador).

create table if not exists public.document_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('company_document', 'document_category')),
  entity_id uuid not null,
  action text not null,
  actor text not null,
  payload_before jsonb,
  payload_after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists document_audit_logs_entity_idx
  on public.document_audit_logs (org_id, entity_type, entity_id, created_at);

alter table public.document_audit_logs enable row level security;

drop policy if exists "document_audit_logs: org-scoped all" on public.document_audit_logs;
create policy "document_audit_logs: org-scoped all"
  on public.document_audit_logs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
