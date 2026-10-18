# Módulo: invitations

**Área:** Plataforma · **Estado (README):** active · **Código:** 6 ficheiros, 1 ficheiros de teste

## Objetivo
Novo RH → Convites e adesões (FE-054): o RH cria um código/link de convite (com centro e departamento opcionais, validade e n.º de utilizações); o trabalhador abre o link e pede a adesão só com nome, apelidos e e-mail; o RH aceita — a criação da pessoa abre pré-preenchida — ou recusa com um motivo interno.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/invitations/` (domain, application, adapters); composição: `invitations.module.ts`; documentação detalhada: `src/modules/invitations/README.md`.
- Endpoints: 5 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
