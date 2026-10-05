Status: done

# Motor de documentos (módulo documents)

Generalizar documentos/categorias com owner_type/owner_id e âmbito; versionamento preservado; data de emissão; documentos da Empresa (aba Documentos). HR passa a consumir via ports. Testes: documento empresarial nunca gera pendência individual; tenant isolation.

## Comments

- 2026-10-05 — Implementado (backend `b093856`, frontend `4e95052`). Decisões D9–D11 na spec. Migração `20261005100000_documents_engine.sql` **pendente de aplicação manual** (incluída no documento para o Raul). Ponto em aberto para o ticket 09: categorias opcionais (incl. Apólice AT, âmbito Ambos) continuam a aparecer como "Em falta" (opcional) na vista global dos Colaboradores.
