# 03 — Auditoria transversal append-only

Status: open

Tabela audit_events (org_id, actor, ação, recurso, antes, depois, motivo, ip, user_agent, correlation_id, prev_hash, hash), trigger anti update/delete, porta AuditTrail usada pelos módulos novos, endpoint de consulta/exportação (company.audit). Verificação da cadeia de hash.
