-- Rollback de 20261211100000_documents_drop_legacy_document_type_not_null.sql:
-- `document_type` volta a obrigatória. As linhas do motor novo ficam com o
-- valor do enum antigo que corresponde à categoria (como o backfill inverso de
-- 20260926120000_hr_people_documents.sql), senão o `set not null` falha.

update public.hr_employee_documents set document_type = case category
    when 'contrato_trabalho' then 'contract'
    when 'cartao_cidadao'    then 'id_card'
    when 'nif'               then 'nif'
    when 'comprovativo_iban' then 'iban'
    else 'other'
  end
where document_type is null;

alter table public.hr_employee_documents
  alter column document_type set not null;
