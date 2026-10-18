# Módulo: calendar

**Área:** RH (Base Organizacional / RH antigo) · **Estado (README):** active (2026-10-06) · **Código:** 12 ficheiros, 2 ficheiros de teste

## Objetivo
O calendário corporativo único (Empresa & Estrutura → Calendário & Eventos): feriados, eventos da empresa e prazos de documentos num só sítio, com a vista "Próximos eventos importantes". O Dashboard futuro deve ler daqui — nunca montar outro calendário.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/calendar/` (domain, application, adapters); composição: `calendar.module.ts`; documentação detalhada: `src/modules/calendar/README.md`.
- Endpoints (10, sob `/api`): `DELETE /calendar/holidays/:id`, `GET /calendar`, `GET /calendar/upcoming`, `PATCH /calendar/events/:id`, `PATCH /calendar/events/:id/cancel`, `PATCH /calendar/holidays/:id`, `POST /calendar/events`, `POST /calendar/holidays`, `POST /calendar/holidays/import`, `POST /calendar/holidays/import/preview`.

## Dependências
Importa portas/tipos de: [access](access.md), [documents](documents.md), [locations](locations.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
