# Módulo: delivery-platforms

**Área:** Financeiro · **Estado (README):** active · **Código:** `src/modules/delivery-platforms/`

## Objetivo
Importar os extratos das plataformas de delivery (Uber Eats, Glovo, Bolt Food) e o SAF-T de vendas do AirMenu (conferência) para saber, por plataforma e mês, vendas, promoções, comissões, marketing, outras taxas e o líquido transferido — base do relatório de margem por plataforma e da DRE com valores reais.

## Estado atual
F1 (backend + página «Plataformas de delivery» no frontend, `/dre/plataformas`) feita no ramo `financeiro-conferencia-vendas` (2026-10-28): leitores Uber (extrato mensal PDF) e Glovo (extrato quinzenal PDF), importação e listagem do mês. Migração `20261205100000_delivery_platform_statements` aplicada em produção (#162, 2026-10-28). F2 em produção (backend #163, frontend #135, 2026-10-28): Bolt (relatório de pedidos CSV + faturas semanais PDF) e SAF-T do AirMenu (XML) com a conferência «SAF-T × extratos» no ecrã; migração `20261206100000_delivery_platform_statements_airmenu` (origem `airmenu`) aplicada.

## Arquitetura
- Código: `src/modules/delivery-platforms/`; composição: `delivery-platforms.module.ts`; documentação: `src/modules/delivery-platforms/README.md`.
- Endpoints (sob `/api`, permissão `dre.statement`): `POST /delivery-platforms/import` (multipart, campo `files`, MANAGE), `GET /delivery-platforms/statements?year&month`, `GET /delivery-platforms/report?year&month` e `GET /delivery-platforms/report/export?year&month&format=xlsx|pdf` e `GET /delivery-platforms/payouts?year&month` (READ).
- Tabela: `delivery_platform_statements` (`org_id`, RLS).

## Dependências
`DescribeMovementPort` de [bank-statements](bank-statements.md) (reconhecer os créditos das plataformas; lê `bank_movements`). `GetRecipeCostingPort` e `GetStockItemCostsPort` de [recipe-costing](recipe-costing.md) (custo real da comida, F5). Expõe `getMarginReport`, usada pela DRE (`cash-flow`, F3b).

## Regras de negócio
Ver «Conceitos de domínio» e «Decisões de design» no README do módulo e `.scratch/importador-plataformas/spec.md`.

F3a feita no ramo (commit, sem push; sem migração): relatório de margem por plataforma (documentos que atravessam o mês repartidos pelo SAF-T diário / vendas diárias da Bolt) com exportação Excel e PDF, no ecrã.

F4 em produção (#166/#138). F5 em produção (#167/#139): custo real da comida e da embalagem (SAF-T × fichas técnicas e artigos), com correção dos produtos no ecrã; migração `20261207100000_delivery_food_cost` aplicada.

## Problemas conhecidos
Documentos fora dos cinco conhecidos são rejeitados com motivo. Relatórios da Bolt com períodos sobrepostos duplicam vendas.

## Próximos trabalhos
F3b feita (DRE com os valores reais); custo real da comida pelas fichas técnicas.
