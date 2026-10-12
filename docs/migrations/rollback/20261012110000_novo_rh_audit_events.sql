-- Rollback de 20261012110000_novo_rh_audit_events.sql
-- A tabela de auditoria NÃO se apaga (task §4.6.7: "Não eliminar dados de
-- auditoria"). O rollback só desliga a escrita nova: o backend anterior não
-- a usa, e os eventos ficam guardados para consulta.

drop trigger if exists audit_events_chain on public.audit_events;
revoke insert on public.audit_events from authenticated;
-- Para voltar a ligar: reaplicar a parte "audit_events_chain" da migração.
