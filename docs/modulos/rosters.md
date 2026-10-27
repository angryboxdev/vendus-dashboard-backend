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

## Áreas de Trabalho e Plano de Cobertura (no ramo `rh`; por publicar)
- Áreas por centro e área de cada turno — migração `20261102100000_novo_rh_work_areas`.
- Plano de Cobertura opcional por empresa (`time_tracking.roster.coverage_enabled`, desligado por omissão) — migração `20261103100000_novo_rh_coverage_rules` (aplicar depois da das áreas; rollback na ordem inversa).
- Nenhuma das migrações foi aplicada em produção.

## Copiar a semana para a seguinte (em produção 2026-10-27)
- `POST /:id/copy-week` — rascunho, dias preenchidos intocados, sobreposições e fora do âmbito saltam (ver README, Decisões). Sem migração.

## Próximos trabalhos
PR para `main` (backend primeiro, com as duas migrações) só com aprovação.
