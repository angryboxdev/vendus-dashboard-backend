# Módulo: locations

**Área:** Plataforma · **Estado (README):** ativo (2026-10-04) · **Código:** 13 ficheiros, 5 ficheiros de teste

## Objetivo
Uma organização pode ter mais do que uma loja/restaurante ou espaço ("location" — ex.: Mercado, Gaia, Escritório, Armazém). O Local é transversal: RH, Stock, Financeiro e os restantes módulos referenciam-no por `location_id`, nunca por texto. Desde a Base Organizacional (ticket 02) o admin gere os Locais na aba Empresa & Estrutura → Locais.

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/locations/` (domain, application, adapters); composição: `locations.module.ts`; documentação detalhada: `src/modules/locations/README.md`.
- Endpoints (6, sob `/api`): `GET /locations`, `GET /locations/:id/history`, `PATCH /locations/:id`, `PATCH /locations/:id/active`, `PATCH /locations/:id/geofence`, `POST /locations`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
