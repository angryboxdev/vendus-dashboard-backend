# Módulo: dashboard

**Área:** Novo RH · **Estado (README):** active · **Código:** 8 ficheiros, 2 ficheiros de teste

## Objetivo
O Dashboard executivo do Novo RH: a primeira tela do dono, gerente geral e gestores. Em poucos segundos mostra quantas unidades estão a funcionar, quais precisam de atenção, como está a equipa hoje, turnos sem cobertura e pedidos por tratar — e deixa abrir o detalhe de cada número.

## Estado atual
Implementado e em produção (dashboard executivo do Novo RH, ADR-0036/0037).

## Arquitetura
- Código: `src/modules/dashboard/` (domain, application, adapters); composição: `dashboard.module.ts`; documentação detalhada: `src/modules/dashboard/README.md`.
- Endpoints (6, sob `/api`): `DELETE /novo-rh/dashboard/layout`, `GET /novo-rh/dashboard/birthdays`, `GET /novo-rh/dashboard/layout`, `GET /novo-rh/dashboard/snapshot`, `GET /novo-rh/dashboard/team`, `PUT /novo-rh/dashboard/layout`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
