# 03 — Auditoria transversal append-only

Status: resolved

Tabela audit_events (org_id, actor, ação, recurso, antes, depois, motivo, ip, user_agent, correlation_id, prev_hash, hash), trigger anti update/delete, porta AuditTrail usada pelos módulos novos, endpoint de consulta/exportação (company.audit). Verificação da cadeia de hash.

## Comments

2026-10-11 — feito (módulo `src/modules/audit`, migração 20261012110000 por aplicar). Settings já audita cada escrita. Testes do trigger/verify ficam para a integração (ticket 09).
