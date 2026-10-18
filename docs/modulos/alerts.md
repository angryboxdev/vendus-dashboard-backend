# Módulo: alerts

**Área:** Novo RH · **Estado (README):** active · **Código:** 6 ficheiros, 1 ficheiros de teste

## Objetivo
Novo RH → Alertas: avisos que nascem de regras (pedidos parados há N dias, contratos ou períodos experimentais a terminar, tarefas em atraso), com dono, prazo para tratar, escalonamento quando o prazo passa e fecho com nota.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/alerts/` (domain, application, adapters); composição: `alerts.module.ts`; documentação detalhada: `src/modules/alerts/README.md`.
- Endpoints: 6 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
