# 02 — Persistência imutável e emissão compare-and-swap

Status: resolved
Fase: F2 · Bloqueado por: 01

Tabelas (`invoicing_series`, `invoicing_documents`, linhas, impostos, `invoicing_events`), RLS por `org_id`, registo em `table-registry.ts`, triggers que recusam UPDATE/DELETE em documentos emitidos (só anulação com motivo), RPC `invoicing_issue_document` com compare-and-swap (último n.º, último hash, último `SystemEntryDate`). Migrações + rollback. **Não aplicar em produção sem aprovação.** Teste de integração da corrida (quando houver stack local).

## Comments
- 2026-11-03 — Revisão (code-review, 2 eixos) + validação em PGlite. Corrigido: referências em snake_case (bug), TRUNCATE, privilégios de escrita retirados, sinalizador só para o dono da função, CM faturada uma vez, NC/ND verificam e bloqueiam os documentos referidos, NIF do emitente e somas conferidos, campos SAF-T por linha, instante UTC para a cronologia (mudança de hora), n.º de certificado por documento e HashControl «0» sem certificado, RC e séries de recuperação fora até terem suporte, funções com prefixo `fn_`. A cronologia compara o instante UTC (`>=`); o compare-and-swap é n.º + hash.
