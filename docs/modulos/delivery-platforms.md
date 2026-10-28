# Módulo: delivery-platforms

**Área:** Financeiro · **Estado (README):** active · **Código:** `src/modules/delivery-platforms/`

## Objetivo
Importar os extratos das plataformas de delivery (Uber Eats, Glovo; Bolt Food na F2) para saber, por plataforma e mês, vendas, promoções, comissões, marketing, outras taxas e o líquido transferido — base do relatório de margem por plataforma e da DRE com valores reais.

## Estado atual
F1 (backend) feita no ramo `financeiro-conferencia-vendas` (2026-10-28): leitores Uber (extrato mensal PDF) e Glovo (extrato quinzenal PDF), importação e listagem do mês. Migração `20261205100000_delivery_platform_statements` por aplicar em produção.

## Arquitetura
- Código: `src/modules/delivery-platforms/`; composição: `delivery-platforms.module.ts`; documentação: `src/modules/delivery-platforms/README.md`.
- Endpoints (sob `/api`, permissão `dre.statement`): `POST /delivery-platforms/import` (multipart, campo `files`, MANAGE) e `GET /delivery-platforms/statements?year&month` (READ).
- Tabela: `delivery_platform_statements` (`org_id`, RLS).

## Dependências
Nenhuma porta de outros módulos. Expõe `listStatements` para a DRE (`cash-flow`) na F3.

## Regras de negócio
Ver «Conceitos de domínio» e «Decisões de design» no README do módulo e `.scratch/importador-plataformas/spec.md`.

## Problemas conhecidos
Só Uber e Glovo em PDF; outros formatos são rejeitados com motivo.

## Próximos trabalhos
Ecrã de importação (frontend); F2 Bolt + SAF-T; F3 relatório por plataforma (ecrã, Excel, PDF) e DRE; F4 conferência das transferências no banco.
