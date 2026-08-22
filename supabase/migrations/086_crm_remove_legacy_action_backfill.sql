-- Remove apenas ações que a versão inicial da migration 085 importou do CRM
-- legado. Ações criadas pela nova feature têm source_contact_id/source_key nulos
-- e são preservadas.

delete from public.crm_customer_actions
where source_contact_id is not null
   or source_key like 'contact:%'
   or source_key like 'legacy-followup:%';

comment on table public.crm_customer_actions is
  'Timeline nova do CRM. Não é alimentada por crm_contacts nem por manual_followup_date legados.';
