# Módulo: crm

**Área:** Vendas e integrações · **Estado (README):** em refactor (2026-08-28) · **Código:** 6 ficheiros, 3 ficheiros de teste

## Objetivo
O módulo CRM centraliza a operação diária sobre clientes: identificar a situação atual de cada pessoa, planejar o próximo contacto, registrar ações concluídas e organizar a base com tags. A listagem operacional já usa este módulo; dashboard e detalhe do cliente ainda pertencem ao CRM legado.

## Estado atual
Implementado (README: em refactor). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/crm/` (domain, application, adapters); composição: `crm.module.ts`; documentação detalhada: `src/modules/crm/README.md`.
- Endpoints (12, sob `/api`): `GET /crm/action-types`, `GET /crm/customer-table`, `GET /crm/customers/:customerId/actions`, `GET /crm/tags`, `PATCH /crm/action-types/:code`, `PATCH /crm/actions/:id/complete`, `PATCH /crm/actions/complete-bulk`, `PATCH /crm/customers/inactive`, `PATCH /crm/customers/tags`, `POST /crm/action-types`, `POST /crm/actions`, `POST /crm/tags`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
