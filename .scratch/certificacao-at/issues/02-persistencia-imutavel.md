# 02 — Persistência imutável e emissão compare-and-swap

Status: resolved
Fase: F2 · Bloqueado por: 01

Tabelas (`invoicing_series`, `invoicing_documents`, linhas, impostos, `invoicing_events`), RLS por `org_id`, registo em `table-registry.ts`, triggers que recusam UPDATE/DELETE em documentos emitidos (só anulação com motivo), RPC `invoicing_issue_document` com compare-and-swap (último n.º, último hash, último `SystemEntryDate`). Migrações + rollback. **Não aplicar em produção sem aprovação.** Teste de integração da corrida (quando houver stack local).
