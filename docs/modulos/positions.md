# Módulo: positions

**Área:** Novo RH · **Estado (README):** active

## Objetivo
Cargos da empresa (Configurações → Estrutura → Cargos): criar, renomear, ativar/inativar, com a contagem de colaboradores ativos por cargo. Nunca há apagar.

## Estado atual
Em produção desde a remoção do backend do RH antigo (ADR-0040, fase 4, 2026-11-02) — o mesmo código que estava em `modules/hr`, agora módulo próprio. Contrato igual em `/api/novo-rh/positions`; `/api/hr/positions` deixou de existir.

## Arquitetura
- Código: `src/modules/positions/`; composição: `positions.module.ts` (montado em `src/server.ts`); detalhe: `src/modules/positions/README.md`.
- Endpoints: `GET/POST /api/novo-rh/positions`, `PATCH /api/novo-rh/positions/:id`, `PATCH /api/novo-rh/positions/:id/active` (`company.positions`).

## Próximos trabalhos
Nenhum registado.
