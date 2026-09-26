-- Fase 1 da spec Task_Recorrencias_Conciliacao_AngryBox.md:
--   - closed_at: data de finalização obrigatória ao fechar uma recorrência
--     (secção 10). Puramente informativo/auditoria — a geração de novas
--     ocorrências já é bloqueada assim que status != 'active'.
--   - vat_rate/vat_included: preferência de IVA da recorrência, usada para
--     auto-preencher o drawer "Justificar despesa → Contrato/Recorrência"
--     (secção 3.B). Não existia nenhum campo de IVA no domínio de
--     recorrências até agora.
alter table recurring_contracts
  add column if not exists closed_at date,
  add column if not exists vat_rate integer,
  add column if not exists vat_included boolean;
