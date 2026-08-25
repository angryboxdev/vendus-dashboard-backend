-- Reinicia o catálogo de tipos de ação antes da entrada em uso da feature.
-- A timeline também é limpa para não manter referências a tipos removidos.

delete from public.crm_customer_actions;
delete from public.crm_action_types;
