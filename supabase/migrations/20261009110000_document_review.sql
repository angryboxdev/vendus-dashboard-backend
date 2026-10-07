-- Portal do Colaborador (ticket 11): o colaborador substitui um documento
-- vencido/a vencer; o RH valida ou rejeita com motivo. Aditiva e nullable.

alter table public.hr_employee_documents
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- Caixa de pedidos: envios do colaborador por validar.
create index if not exists hr_employee_documents_pending_idx
  on public.hr_employee_documents (org_id)
  where status = 'pending_validation' and is_current;
