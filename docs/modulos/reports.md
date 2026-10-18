# Módulo: reports

**Área:** Novo RH · **Estado (README):** active · **Código:** 6 ficheiros, 1 ficheiros de teste

## Objetivo
Novo RH → Relatórios: assiduidade, saldos, ausências, dados incompletos, contratos e histórico de alterações, agrupados por tema, com filtros por centro e por pessoa e escolha de colunas; para ver no ecrã ou descarregar em CSV.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/reports/` (domain, application, adapters); composição: `reports.module.ts`; documentação detalhada: `src/modules/reports/README.md`.
- Endpoints: 2 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
