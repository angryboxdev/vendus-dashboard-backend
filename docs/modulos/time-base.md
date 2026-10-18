# Módulo: time-base

**Área:** Novo RH · **Estado (README):** active · **Código:** 10 ficheiros, 1 ficheiros de teste

## Objetivo
Novo RH → Tempo: os horários (fixos ou flexíveis, com versões por data), os calendários de feriados por centro e os de férias, a quem se aplicam e desde quando, e o tempo teórico de cada colaborador em cada dia — a base de toda a assiduidade (Fase 4) e das férias (Fase 5).

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/time-base/` (domain, application, adapters); composição: `time-base.module.ts`; documentação detalhada: `src/modules/time-base/README.md`.
- Endpoints: 23 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
