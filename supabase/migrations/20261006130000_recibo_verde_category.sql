-- Base Organizacional 1.0 — ticket 10 (complemento): categoria "Recibo verde".
--
-- Prestadores independentes passam recibo verde (fatura-recibo emitida por
-- eles à empresa); os contratados recebem recibo de vencimento. Mesma
-- mecânica (documento periódico do colaborador, um por período, importação
-- em massa), categorias separadas para não se misturarem.
--
-- Depende de `20261006120000_payslips_period.sql` (coluna requires_period).
-- Reexecutável.

insert into public.hr_document_categories
  (org_id, slug, label, mandatory, job_roles, position_ids, accepted_mime_types, scope, requires_period)
select o.id, 'recibo_verde', 'Recibo verde', false, '{}', '{}', array['application/pdf'], 'employee', true
from public.organizations o
on conflict (org_id, slug) do nothing;

update public.hr_document_categories
set requires_period = true, updated_at = now()
where slug = 'recibo_verde' and not requires_period;
