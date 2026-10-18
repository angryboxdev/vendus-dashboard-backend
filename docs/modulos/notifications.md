# Módulo: notifications

**Área:** Plataforma · **Estado (README):** active · **Código:** 7 ficheiros, 1 ficheiros de teste

## Objetivo
Avisos dentro da aplicação para quem tem de saber de algo (ex.: alguém fez uma alteração retroativa às regras). Cada pessoa vê só os seus e marca-os como lidos. E-mail e push ficam para mais tarde (decisão D12).

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/notifications/` (domain, application, adapters); composição: `notifications.module.ts`; documentação detalhada: `src/modules/notifications/README.md`.
- Endpoints (4, sob `/api`): `GET /me/notifications`, `GET /me/notifications/unread-count`, `POST /me/notifications/:id/read`, `POST /me/notifications/read-all`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
