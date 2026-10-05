Status: done

# Documento com validade → prazo no calendário

source_type=DOCUMENT/source_id; atualizar ao mudar validade, inativar ao substituir, idempotente.

## Comments

- 2026-10-06 — Implementado com o 04: prazos derivados em leitura das versões atuais dos documentos da Empresa (via `ListCompanyDocumentsPort`), com `source: { type: "document", id }`. Atualizar validade move o prazo, substituir troca-o, reprocessar nunca duplica — por construção, sem tabela própria.
