# Módulo: sales-summary

**Área:** Financeiro · **Estado (README):** active · **Código:** 14 ficheiros, 3 ficheiros de teste

## Objetivo
The manager has no single consolidated view of monthly revenue. Vendus covers in-person channels (Salão, Take Away, Eatz); AirMenu covers delivery platforms (Uber Eats, Glovo, Bolt Food). Getting a complete picture requires visiting two pages, applying filters manually, and adding up numbers by hand.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/sales-summary/` (domain, application, adapters); composição: `sales-summary.module.ts`; documentação detalhada: `src/modules/sales-summary/README.md`.
- Endpoints (3, sob `/api`): `GET /sales-summary`, `GET /sales-summary/growth`, `POST /sales-summary/refresh`.

## Dependências
Importa portas/tipos de: [air-menu](air-menu.md), [vendus](vendus.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
