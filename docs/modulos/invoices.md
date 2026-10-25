# Módulo: invoices

**Área:** Financeiro · **Estado (README):** ativo (2026-09-30 (fix: crash ao mudar "Impacto no stock"/descartar) · **Código:** 90 ficheiros, 32 ficheiros de teste

## Objetivo
Todos os meses chegam dezenas de faturas à Angrybox — da Makro, da EDP, da NOS, de plataformas de marketing, de fornecedores de embalagens. Sem um sistema, essas faturas ficam em papel, em email ou numa pasta de computador, e o manager não sabe ao certo o que deve, quando vence, nem quanto gastou por área.

## Estado atual
Implementado. F1 (task Financeiro/Stock v1.2) em produção desde 2026-10-14 (PR #79). F2 backend concluído no ramo `financeiro` (não integrado em `main`).

**Funcionalidades relevantes** (`[ramo financeiro]` = commits locais/ramo não integrado em `main`):
- Importação por IA (PDF/imagem) com revisão; reimportação do mesmo ficheiro (SHA-256) ou da mesma identidade fiscal devolve o documento existente (F1).
- Motor único de valores no servidor ao criar/confirmar: decimal exato, descontos %/€ por linha e global, rodapé sem duplicar, IVA por taxa, «Diferença para a fatura»; finaliza só a 0,00 € (422 `amounts_not_reconciled`); ajuste de arredondamento ≤ 1 cêntimo/taxa com motivo (F1).
- Identidade fiscal partilhada com o Stock via `fiscal-documents` (409 com `code`); uma obrigação ativa por fatura; conta a pagar acompanha total/vencimento (409 `payable_settled` se já paga) (F1).
- Versão com bloqueio otimista (409 `version_conflict`), auditoria (`invoice_audit_logs`) e `Idempotency-Key` opcional em criar/importar/confirmar (F1).
- [ramo financeiro] «Enviar para Stock»: sugestão (exceção da loja → fornecedor → categoria) e validação em criar/confirmar (422 `stock_decision_required`/`stock_reason_required`).
- [ramo financeiro] Modos «Única | Por artigo | Por valores» (`line_detail_mode` simple|detailed|by_values) + `invoice_allocations`; linhas reais guardadas em todos os modos; «Guardar rascunho» (`POST /invoices/:id/draft`); `PUT /invoices/:id/allocations`; detalhe devolve `storedAmounts`.
- [ramo financeiro] `GET /invoices/payables-summary` — Total a pagar | Em atraso sobre o saldo aberto do razão.
- [produção 2026-10-24] Leitor inteligente: QR fiscal + layout Makro antes da IA no import, categoria sugerida por linha, documentos de cobrança AT/SS (`domain/services/reading/`, `domain/services/classification/`). Ver `.scratch/leitor-faturas/spec.md`.
- [por publicar] Rascunho de obrigação AT/SS (E3b-2): `POST /invoices/obligations`, `invoices.document_kind` + referência/entidade MB/período (migração `20261109100000`); sem IVA, linhas nem Stock; conta a pagar ao confirmar.

## Arquitetura
- Código: `src/modules/invoices/` (domain, application, adapters); composição: `invoices.module.ts`; documentação detalhada: `src/modules/invoices/README.md`.
- Endpoints (25, sob `/api`): `DELETE /invoices/:id`, `DELETE /invoices/:invoiceId/lines/:lineId`, `GET /invoices`, `GET /invoices/:id`, `GET /invoices/alerts`, `GET /invoices/allocations`, `GET /invoices/integrity/payable-duplicates`, `GET /invoices/lines`, `GET /invoices/payables-summary`, `GET /invoices/suggest-classification/:supplierId`, `PATCH /invoices/:id`, `PATCH /invoices/:id/line-detail-mode`, `PATCH /invoices/:id/paid`, `PATCH /invoices/:id/status`, … — lista completa e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Importa portas/tipos de: [financial-base](financial-base.md), [fiscal-documents](fiscal-documents.md), [stock-purchase-review](stock-purchase-review.md).

## Regras de negócio
- O servidor nunca confia nos totais enviados pelo cliente; recalcula com o motor (`domain/services/invoice-amounts.service.ts`, `src/kernel/money`).
- Notas de crédito: totais guardados negativos (entidade normaliza o sinal); cálculo em valor absoluto.
- Feed de análise `GET /invoices/lines` só inclui linhas de faturas «Por artigo» (evita dupla contagem); «Por valores» tem feed próprio `GET /invoices/allocations`.
- «Por valores»: soma das repartições = base líquida ao cêntimo; mudar a base exige rever a repartição (nunca redistribuir em silêncio).
- Trocar de modo nunca apaga linhas (antes da F2, voltar a «Única» apagava).

## Problemas conhecidos
- Relatório de IVA (accounting) só conta IVA de compras a partir de linhas «Por artigo» — faturas «Única» não entram (lacuna anterior, não corrigida).
- Edição de fatura já lançada (`PATCH /invoices/:id`) não passa pelo motor de valores.
- Sem versão em marcar como paga / mudar estado / operações de linha.
- Frontend ainda não envia `Idempotency-Key`.

## Próximos trabalhos
- Concluir F2 no frontend e integrar (ver docs/02_ESTADO_ATUAL.md).
- Correr o backfill da identidade fiscal em produção (dry-run primeiro).

Guia de migração F1: `docs/migrations/financeiro-f1.md`. Task completa: `.scratch/financeiro-stock-v1-2/task-mestre-v1.2.md`.
