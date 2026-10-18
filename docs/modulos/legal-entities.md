# Módulo: legal-entities

**Área:** Plataforma · **Estado (README):** active · **Código:** 6 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Entidades legais (FE-092): as empresas empregadoras do grupo (ex.: a entidade portuguesa e a espanhola), com os dados fiscais e de Segurança Social, e a entidade de cada centro (FE-093).

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/legal-entities/` (domain, application, adapters); composição: `legal-entities.module.ts`; documentação detalhada: `src/modules/legal-entities/README.md`.
- Endpoints: 7 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
