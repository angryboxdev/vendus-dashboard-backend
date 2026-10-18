# Módulo: air-menu

**Área:** Vendas e integrações · **Estado (README):** ativo (2026-09-05) · **Código:** 36 ficheiros, 10 ficheiros de teste

## Objetivo
Integração com a plataforma AirMenu — agregador que centraliza pedidos de múltiplas plataformas de entrega (Glovo, Uber Eats, Bolt Food) num único ponto. Permite consultar, no dashboard, todos os pedidos recebidos por enterprise com indicação da plataforma de origem, itens, valor e tipo de documento fiscal, e obter KPIs e breakdowns analíticos/contabilísticos sobre as vendas de delivery. O problema que reso

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/air-menu/` (domain, application, adapters); composição: `air-menu.module.ts`; documentação detalhada: `src/modules/air-menu/README.md`.
- Endpoints (4, sob `/api`): `GET /air-menu/enterprises`, `GET /air-menu/orders/:orderId/raw`, `GET /air-menu/summary`, `POST /air-menu/webhook/register`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
