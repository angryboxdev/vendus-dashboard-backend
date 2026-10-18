# Módulo: rosters

**Área:** Novo RH · **Estado (README):** active · **Código:** 9 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Escalas: modelos de turno (nome e abreviatura, uma ou mais faixas), escalas por centro ou grupo, turnos em rascunho, publicar (cada publicação é uma versão no histórico e avisa quem foi afetado), atribuição em massa, avisos/bloqueios de restrições e trocas de turno com aprovação.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/rosters/` (domain, application, adapters); composição: `rosters.module.ts`; documentação detalhada: `src/modules/rosters/README.md`.
- Endpoints: 21 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
