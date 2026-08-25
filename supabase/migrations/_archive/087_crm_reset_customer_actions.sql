-- Reinicia a nova timeline antes da entrada em uso do fluxo definitivo.
-- A pedido do produto, todas as últimas/próximas ações existentes são apagadas.
-- O catálogo crm_action_types é preservado.

delete from public.crm_customer_actions;
