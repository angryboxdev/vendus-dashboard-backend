# Módulo: periods

**Área:** Novo RH · **Estado (README):** active · **Código:** 8 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Fecho de período: criar o período (da organização ou de um centro), ver o que está pendente, fechar (congela os dias), pedir reabertura (com dupla aprovação) e exportar para salários e faturação.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/periods/` (domain, application, adapters); composição: `periods.module.ts`; documentação detalhada: `src/modules/periods/README.md`.
- Endpoints: 11 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
