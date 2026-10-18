# Módulo: inbox

**Área:** Novo RH · **Estado (README):** active · **Código:** 5 ficheiros, 2 ficheiros de teste

## Objetivo
A Caixa de pedidos do Novo RH (FE-050): num só sítio, quem aprova vê e decide todos os pedidos que lhe cabem — ausências, correções de ponto, excedente de horas, trocas de turno e solicitações personalizadas —, um a um ou em lote.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/inbox/` (domain, application, adapters); composição: `inbox.module.ts`; documentação detalhada: `src/modules/inbox/README.md`.
- Endpoints: 1 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
