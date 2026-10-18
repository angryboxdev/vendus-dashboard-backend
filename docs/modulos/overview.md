# Módulo: overview

**Área:** Novo RH · **Estado (README):** active · **Código:** 6 ficheiros, 2 ficheiros de teste

## Objetivo
O Painel do Novo RH: num só ecrã, o dono ou a gestão vê o que se passa hoje na empresa — quem está a trabalhar, quem faltou, quem chegou atrasado, quem está ausente, o que está pendente — e abre o detalhe de cada pessoa.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/overview/` (domain, application, adapters); composição: `overview.module.ts`; documentação detalhada: `src/modules/overview/README.md`.
- Endpoints (2, sob `/api`): `GET /novo-rh/overview`, `GET /novo-rh/overview/plan`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
