# Módulo: stock-planning

**Área:** Stock · **Estado (README):** active · **Código:** 65 ficheiros, 19 ficheiros de teste

## Objetivo
Hoje o Stock é puramente reativo: mostra o que já aconteceu (saldo, movimentos, "compras por rever", contagens físicas). Este módulo ("Planeamento de Stock" / Stock Intelligence 3.0) acrescenta uma camada de previsão e recomendação: o que provavelmente vai faltar, quando, e o que convém comprar — sem nunca alterar stock diretamente.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/stock-planning/` (domain, application, adapters); composição: `stock-planning.module.ts`; documentação detalhada: `src/modules/stock-planning/README.md`.
- Endpoints (13, sob `/api`): `GET /stock-planning/alerts`, `GET /stock-planning/alerts/:id`, `GET /stock-planning/history`, `GET /stock-planning/items`, `GET /stock-planning/items/:id`, `GET /stock-planning/purchase-list`, `POST /stock-planning/alerts/:id/acknowledge`, `POST /stock-planning/alerts/:id/silence`, `POST /stock-planning/backfill`, `POST /stock-planning/detect-deviation`, `POST /stock-planning/feedback/:id/submit`, `POST /stock-planning/recommendations/:id/review`, `POST /stock-planning/run-forecast`.

## Dependências
Importa portas/tipos de: [financial-base](financial-base.md), [locations](locations.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
