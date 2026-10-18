# Módulo: absences

**Área:** Novo RH · **Estado (README):** active · **Código:** 11 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Ausências: tipos de ausência (férias, permissões, licenças, compensação), pedidos do colaborador ou atribuídos pela gestão, aprovação em vários níveis e saldos que nunca se apagam (cada mexida é um movimento).

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/absences/` (domain, application, adapters); composição: `absences.module.ts`; documentação detalhada: `src/modules/absences/README.md`.
- Endpoints: 23 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
