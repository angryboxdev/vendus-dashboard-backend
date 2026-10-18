# Módulo: sales-declaration

**Área:** Financeiro · **Estado (README):** ativo (2026-10-06) · **Código:** 10 ficheiros, 4 ficheiros de teste

## Objetivo
O Mercado Bom Sucesso (centro comercial onde a Angry Box tem a loja L027) exige uma declaração semanal do valor faturado, num ficheiro Excel com formato fixo (`SalesReport_<início>_<fim>.xlsx`, folha `SalesDeclaration`).

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/sales-declaration/` (domain, application, adapters); composição: `sales-declaration.module.ts`; documentação detalhada: `src/modules/sales-declaration/README.md`.
- Endpoints (1, sob `/api`): `POST /sales-declaration/export`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
