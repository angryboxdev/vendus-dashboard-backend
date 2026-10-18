# Módulo: stock-count

**Área:** Stock · **Estado (README):** active · **Código:** 42 ficheiros, 12 ficheiros de teste

## Objetivo
O botão "Atualizar stock" era um lançamento manual de deltas (+/-) por linha — quem contava tinha de saber e calcular o ajuste sozinho, sem nenhuma noção de "quanto o sistema espera" vs. "quanto existe fisicamente". Este módulo substitui esse botão por uma engine genérica de contagem física: define o escopo (que itens contar), materializa o stock teórico no momento de iniciar, regista tentativas de contagem, compara

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/stock-count/` (domain, application, adapters); composição: `stock-count.module.ts`; documentação detalhada: `src/modules/stock-count/README.md`.
- Endpoints (14, sob `/api`): `GET /stock-count/sessions`, `GET /stock-count/sessions/:id`, `GET /stock-count/zones`, `POST /stock-count/lines/:id/attempts`, `POST /stock-count/lines/:id/request-recount`, `POST /stock-count/lines/:id/resolve`, `POST /stock-count/sessions`, `POST /stock-count/sessions/:id/cancel`, `POST /stock-count/sessions/:id/confirm`, `POST /stock-count/sessions/:id/finish-execution`, `POST /stock-count/sessions/:id/mark-ready`, `POST /stock-count/sessions/:id/start`, `POST /stock-count/sessions/:id/unscoped-item`, `POST /stock-count/zones`.

## Dependências
Importa portas/tipos de: [access](access.md), [locations](locations.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
