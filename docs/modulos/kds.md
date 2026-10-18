# Módulo: kds

**Área:** Vendas e integrações · **Estado (README):** ativo (2026-08-06) · **Código:** 11 ficheiros, 2 ficheiros de teste

## Objetivo
Kitchen Display System — ecrã da cozinha que mostra, em tempo real, todos os pedidos activos (Vendus e plataformas de delivery) e permite à equipa gerir o estado de cada pedido (em preparo, pronto, entregue).

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/kds/` (domain, application, adapters); composição: `kds.module.ts`; documentação detalhada: `src/modules/kds/README.md`.
- Endpoints (4, sob `/api`): `GET /kds/deliveries`, `GET /kds/stream`, `PATCH /kds/air-menu-deliveries/:id/status`, `PATCH /kds/deliveries/:id/status`.

## Dependências
Importa portas/tipos de: [air-menu](air-menu.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
