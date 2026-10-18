# Módulo: vendus

**Área:** Vendas e integrações · **Estado (README):** ativo (2026-09-05) · **Código:** 36 ficheiros, 11 ficheiros de teste

## Objetivo
Integração com o sistema de faturação Vendus — POS onde todas as vendas e consumos internos do negócio são registados. Serve dois propósitos distintos no dashboard: 1. Faturação de clientes — consultar documentos fiscais emitidos (salão, eatz/delivery, take-away) com breakdowns por canal, categoria, IVA e produto, e obter KPIs históricos de faturação. 2. Autoconsumo de funcionários — consultar o que os fu

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/vendus/` (domain, application, adapters); composição: `vendus.module.ts`; documentação detalhada: `src/modules/vendus/README.md`.
- Endpoints (6, sob `/api`): `GET /vendus/analytics/current`, `GET /vendus/analytics/historical`, `GET /vendus/documents`, `GET /vendus/documents/:id`, `GET /vendus/selfconsumption`, `GET /vendus/summary`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
