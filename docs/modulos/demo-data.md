# Módulo: demo-data

**Área:** Plataforma · **Estado (README):** active · **Código:** 16 ficheiros, 4 ficheiros de teste

## Objetivo
Gera dados fictícios de RH (organizações, centros, funcionários, horários e marcações de ponto) para a organização de demonstração do "Novo RH" — para testar e mostrar o sistema sem tocar em dados reais (RGPD, task RH §4.3).

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/demo-data/` (domain, application, adapters); composição: `demo-data.module.ts`; documentação detalhada: `src/modules/demo-data/README.md`.
- Endpoints: 1 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
