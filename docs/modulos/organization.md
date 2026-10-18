# Módulo: organization

**Área:** Plataforma · **Estado (README):** active (2026-10-04) · **Código:** 17 ficheiros, 3 ficheiros de teste

## Objetivo
A aba Empresa de "Empresa & Estrutura": os dados da entidade legal que usa o Hub — razão social, NIF, NISS, morada fiscal, contactos, fuso horário e logotipo.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/organization/` (domain, application, adapters); composição: `organization.module.ts`; documentação detalhada: `src/modules/organization/README.md`.
- Endpoints (4, sob `/api`): `GET /organization`, `GET /organization/history`, `PATCH /organization`, `POST /organization/logo`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
