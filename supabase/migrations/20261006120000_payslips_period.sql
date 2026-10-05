-- Base Organizacional 1.0 — ticket 10 "Recibos de vencimento + importação em
-- massa" (.scratch/base-organizacional).
--
-- O recibo é um documento do colaborador como os outros (task §23 — sem
-- módulo nem tabela próprios), mas periódico: cada versão pertence a um
-- período Mês/Ano.
--
-- 1. `hr_document_categories.requires_period` — categorias periódicas exigem
--    o período no upload e nunca geram "Em falta" (task §26).
-- 2. `hr_employee_documents.period` — 'YYYY-MM'; NULL nos documentos não
--    periódicos (todos os existentes).
-- 3. Semeia a categoria `recibo_vencimento` em todas as organizações
--    (opcional, só colaboradores, só PDF). Se já existir uma categoria com
--    esse slug, passa a ser periódica.
--
-- Duplicados (tenant + colaborador + categoria + período, task §26) são
-- bloqueados pela aplicação, como a unicidade por categoria já era: não há
-- índice único porque "Substituir versão" grava a nova versão antes de
-- marcar a anterior como substituída.
-- Reexecutável.

alter table public.hr_document_categories
  add column if not exists requires_period boolean not null default false;

alter table public.hr_employee_documents
  add column if not exists period text;

alter table public.hr_employee_documents
  drop constraint if exists hr_employee_documents_period_format_check;
alter table public.hr_employee_documents
  add constraint hr_employee_documents_period_format_check
  check (period is null or period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

create index if not exists hr_employee_documents_org_category_period_idx
  on public.hr_employee_documents (org_id, category, period)
  where period is not null and is_current;

insert into public.hr_document_categories
  (org_id, slug, label, mandatory, job_roles, position_ids, accepted_mime_types, scope, requires_period)
select o.id, 'recibo_vencimento', 'Recibo de vencimento', false, '{}', '{}', array['application/pdf'], 'employee', true
from public.organizations o
on conflict (org_id, slug) do nothing;

update public.hr_document_categories
set requires_period = true, updated_at = now()
where slug = 'recibo_vencimento' and not requires_period;
