# Módulo: workspace

**Área:** Novo RH · **Estado (README):** active · **Código:** 6 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Tarefas, Solicitações e Quem está: tarefas operacionais com checklist e prazo; formulários de pedidos personalizados (ex.: fardamento) decididos pela gestão; e quem está a trabalhar agora, só do próprio centro.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/workspace/` (domain, application, adapters); composição: `workspace.module.ts`; documentação detalhada: `src/modules/workspace/README.md`.
- Endpoints: 18 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
