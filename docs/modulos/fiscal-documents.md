# Módulo: fiscal-documents

**Área:** Financeiro · **Estado (README):** active · **Código:** 8 ficheiros, 1 ficheiros de teste

## Objetivo
Garante que uma fatura (ou nota de crédito) real tem uma só identidade no Mezza, venha do Financeiro ou do Stock. Impede a mesma fatura de ser lançada duas vezes ou de entrar duas vezes no stock.

## Estado atual
Implementado e em produção (F1, 2026-10-14).

**Funcionalidades relevantes** (`[ramo financeiro]` = commits locais/ramo não integrado em `main`):
- Identidade fiscal única: org + entidade compradora + país/NIF do emitente + tipo + série/número normalizado; unicidade na BD (corrida → 23505 → identidade vencedora).
- NIF PT só com dígito de controlo válido; NIF estrangeiro exige país; série/número preserva zeros e separadores.
- Usado por `invoices` e pela importação legada do Stock (`src/services/supplierInvoiceImportService.ts`).
- `POST /api/fiscal-documents/backfill` com `dryRun` por omissão (relatório de duplicados/incompletos; nada é fundido).

## Arquitetura
- Código: `src/modules/fiscal-documents/` (domain, application, adapters); composição: `fiscal-documents.module.ts`; documentação detalhada: `src/modules/fiscal-documents/README.md`.
- Endpoints (1, sob `/api`): `POST /fiscal-documents/backfill`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
- Possível duplicado = comparação manual, nunca fusão automática.
- Apagar fatura liberta a chave (FK `on delete set null`).

## Problemas conhecidos
- Backfill do histórico ainda não executado em produção (precisa de sessão de gestor).

## Próximos trabalhos
- Executar backfill dry-run e rever relatório.

Decisão: `docs/adr/0039-identidade-fiscal-partilhada.md`.
