# Módulo: audit

**Área:** Plataforma · **Estado (README):** active · **Código:** 7 ficheiros, 1 ficheiros de teste

## Objetivo
O registo de auditoria do Novo RH: cada alteração fica guardada com quem, quando, o quê, o valor antes e depois, o motivo, o IP e o dispositivo. Não se pode alterar nem apagar, e é possível provar que ninguém mexeu nos registos.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/audit/` (domain, application, adapters); composição: `audit.module.ts`; documentação detalhada: `src/modules/audit/README.md`.
- Endpoints: 3 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
