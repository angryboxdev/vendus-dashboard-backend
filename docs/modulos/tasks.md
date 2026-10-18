# Módulo: tasks

**Área:** Plataforma · **Estado (README):** ativo (2026-06-10) · **Código:** 16 ficheiros, 4 ficheiros de teste

## Objetivo
Módulo de referência da arquitetura hexagonal deste projecto. Gere tarefas simples (criar, listar, concluir) e serve de molde para todos os módulos novos: demonstra, de forma completa e idiomática, todos os padrões da arquitectura. Não é responsabilidade deste módulo: autenticação, notificações reais (usa apenas um adapter de console), ou persistência em base de dados (o adapter Postgres é um stub).

## Estado atual
Módulo de referência do padrão hexagonal (não montado em `src/server.ts`).

## Arquitetura
- Código: `src/modules/tasks/` (domain, application, adapters); composição: `tasks.module.ts`; documentação detalhada: `src/modules/tasks/README.md`.
- Endpoints (3, sob `/api`): `GET /tasks`, `PATCH /tasks/:id/complete`, `POST /tasks`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
- É o único molde para módulos novos (CLAUDE.md).

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
