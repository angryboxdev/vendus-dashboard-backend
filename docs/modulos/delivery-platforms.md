# Módulo: delivery-platforms

**Área:** Financeiro · **Estado (README):** active · **Código:** `src/modules/delivery-platforms/`

## Objetivo
Importar os extratos das plataformas de delivery (Uber Eats, Glovo, Bolt Food) e o SAF-T de vendas do AirMenu (conferência) para saber, por plataforma e mês, vendas, promoções, comissões, marketing, outras taxas e o líquido transferido — base do relatório de margem por plataforma e da DRE com valores reais.

## Estado atual
F1 (backend + página «Plataformas de delivery» no frontend, `/dre/plataformas`) feita no ramo `financeiro-conferencia-vendas` (2026-10-28): leitores Uber (extrato mensal PDF) e Glovo (extrato quinzenal PDF), importação e listagem do mês. Migração `20261205100000_delivery_platform_statements` aplicada em produção (#162, 2026-10-28). F2 em produção (backend #163, frontend #135, 2026-10-28): Bolt (relatório de pedidos CSV + faturas semanais PDF) e SAF-T do AirMenu (XML) com a conferência «SAF-T × extratos» no ecrã; migração `20261206100000_delivery_platform_statements_airmenu` (origem `airmenu`) aplicada.

## Arquitetura
- Código: `src/modules/delivery-platforms/`; composição: `delivery-platforms.module.ts`; documentação: `src/modules/delivery-platforms/README.md`.
- Endpoints (sob `/api`, permissão `dre.statement`): `POST /delivery-platforms/import` (multipart, campo `files`, MANAGE) e `GET /delivery-platforms/statements?year&month` (READ).
- Tabela: `delivery_platform_statements` (`org_id`, RLS).

## Dependências
Nenhuma porta de outros módulos. Expõe `listStatements` para a DRE (`cash-flow`) na F3.

## Regras de negócio
Ver «Conceitos de domínio» e «Decisões de design» no README do módulo e `.scratch/importador-plataformas/spec.md`.

## Problemas conhecidos
Documentos fora dos cinco conhecidos são rejeitados com motivo. Relatórios da Bolt com períodos sobrepostos duplicam vendas.

## Próximos trabalhos
F3 relatório (repartir os extratos que atravessam o mês pelo SAF-T diário) por plataforma (ecrã, Excel, PDF) e DRE; F4 conferência das transferências no banco.
