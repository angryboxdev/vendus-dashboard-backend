# Módulo: stock-purchase-review

**Área:** Stock · **Estado (README):** active · **Código:** 42 ficheiros, 14 ficheiros de teste

## Objetivo
Nem toda fatura de mercadoria muda o stock automaticamente — hoje, mesmo uma fatura da Makro paga pela conta da empresa não gera nenhum inventário nem pendência: o stock só muda por ajuste manual ou pelo consumo calculado a partir das vendas. Este módulo cria a ponte que faltava: quando uma fatura é lançada, o sistema decide (de forma auditável, nunca sozinho) se ela deve gerar uma "Compra por rever"; um gestor de St

## Estado atual
Implementado (Compras por rever). F2 §2.1 em produção. F3a: linhas com IVA/referência/categoria, custo pelo líquido, três conferências (documento bloqueia, categorias = pendência), divisão por lojas, «Excluída — não afeta Stock». **F3a em produção** (#112). **F3b por publicar** (migração `20261111100000_stock_review_suggestions`): conciliação proposta (histórico → nome → IA, fator pela embalagem), fila ativa/histórico com valor e progresso, retirar/repor. F3c por fazer.

**Funcionalidades relevantes** (`[ramo financeiro]` = commits locais/ramo não integrado em `main`):
- Revisão de stock criada a partir de faturas finalizadas (gancho fire-and-forget de `invoices`), idempotente por fatura.
- Decisão create/skip/unresolved: override → categoria → fornecedor (`domain/services/stock-review-decision.service.ts`).
- [ramo financeiro] Sugestão «Enviar para Stock» (`domain/services/stock-routing-suggestion.service.ts`): exceção da loja → fornecedor → categoria → sem sinal.

## Arquitetura
- Código: `src/modules/stock-purchase-review/` (domain, application, adapters); composição: `stock-purchase-review.module.ts`; documentação detalhada: `src/modules/stock-purchase-review/README.md`.
- Endpoints (8, sob `/api`): `GET /stock-purchase-reviews`, `GET /stock-purchase-reviews/:id`, `GET /stock-purchase-reviews/:id/lines/:lineId/suggestion`, `POST /stock-purchase-reviews/:id/cancel`, `POST /stock-purchase-reviews/:id/confirm`, `POST /stock-purchase-reviews/:id/decide-unresolved`, `POST /stock-purchase-reviews/:id/lines/:lineId/resolve`, `POST /stock-purchase-reviews/cancel-empty`.

## Dependências
Importa portas/tipos de: [financial-base](financial-base.md), [invoices](invoices.md), [locations](locations.md).

## Regras de negócio
- Nunca decide pelo Centro de Custo.
- Revisão já aplicada bloqueia alterações que apaguem linhas (guard partilhado em `invoices`).

## Problemas conhecidos
- Faturas sem linhas não geram revisão (até à F2 o modo «Única» não guardava linhas).

## Próximos trabalhos
- F3c: importação no Stock com pendência financeira (inclui «A extrair»/«Falha de extração», reprocessamento e linhas manuais).
