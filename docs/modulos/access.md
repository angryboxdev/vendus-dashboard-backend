# Módulo: access

**Área:** Plataforma · **Estado (README):** active (new pattern) · **Código:** 22 ficheiros, 6 ficheiros de teste

## Objetivo
Autorização do Hub por Perfil de acesso → permissões herdadas → exceções individuais (Utilizadores & Perfis de Acesso 2.0, `.scratch/utilizadores-perfis`). Decide, em cada pedido, se o utilizador pode consultar (READ) ou gerir (MANAGE) cada funcionalidade. Não autentica (isso é Supabase Auth + `middleware/auth`) e não gere contas (módulo de Utilizadores, tickets 05–06).

## Estado atual
Implementado (README: active (new pattern)). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/access/` (domain, application, adapters); composição: `access.module.ts`; documentação detalhada: `src/modules/access/README.md`.
- Endpoints (22, sob `/api`): `GET /access-profiles`, `GET /access-profiles/:id/governance`, `GET /access-profiles/field-catalog`, `GET /access-profiles/history`, `GET /access-profiles/history.csv`, `GET /me/access`, `GET /users`, `GET /users/:id`, `GET /users/:id/scopes`, `GET /users/employee-options`, `PATCH /access-profiles/:id`, `PATCH /access-profiles/:id/active`, `PATCH /users/:id`, `PATCH /users/:id/status`, … — lista completa e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
