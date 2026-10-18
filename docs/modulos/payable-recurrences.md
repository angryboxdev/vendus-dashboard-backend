# Módulo: payable-recurrences

**Área:** Financeiro · **Estado (README):** ativo (2026-09-09 (`kiosk-pin-storage-prefix` ticket 03 — `Document) · **Código:** 46 ficheiros, 17 ficheiros de teste

## Objetivo
A Angrybox tem despesas que se repetem todos os meses — aluguel da loja, energia, internet, contabilidade, salários. Quando estas obrigações só aparecem no sistema depois de uma fatura importada ou de um movimento bancário conciliado, o gestor perde previsibilidade e o sistema fica reativo. Este módulo resolve esse problema criando recorrências: regras permanentes que descrevem um compromisso financeiro e geram a

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/payable-recurrences/` (domain, application, adapters); composição: `payable-recurrences.module.ts`; documentação detalhada: `src/modules/payable-recurrences/README.md`.
- Endpoints (23, sob `/api`): `DELETE /payable-recurrences/:id/document`, `DELETE /payable-recurrences/occurrences/:occId`, `DELETE /payable-recurrences/occurrences/:occId/document`, `GET /payable-recurrences`, `GET /payable-recurrences/:id`, `GET /payable-recurrences/:id/occurrences`, `GET /payable-recurrences/occurrences`, `GET /payable-recurrences/occurrences/:occId`, `GET /payable-recurrences/occurrences/by-invoice/:invoiceId`, `GET /payable-recurrences/occurrences/linked-invoice-ids`, `GET /payable-recurrences/summary`, `GET /payable-recurrences/summary/monthly`, `PATCH /payable-recurrences/:id`, `PATCH /payable-recurrences/:id/close`, … — lista completa e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
