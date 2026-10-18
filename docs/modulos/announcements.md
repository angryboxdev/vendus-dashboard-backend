# Módulo: announcements

**Área:** Novo RH · **Estado (README):** active · **Código:** 6 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Comunicados: escrever um aviso, escolher para quem vai (todos, centros, grupos ou pessoas), publicar e saber quem recebeu, leu e confirmou.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/announcements/` (domain, application, adapters); composição: `announcements.module.ts`; documentação detalhada: `src/modules/announcements/README.md`.
- Endpoints: 12 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
