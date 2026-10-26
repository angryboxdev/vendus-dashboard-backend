# Módulo: bank-statements

**Área:** Financeiro · **Estado (README):** ativo (2026-09-30 ("Liquidação agrupada" — um movimento liquida N f) · **Código:** 63 ficheiros, 31 ficheiros de teste

## Objetivo
O módulo de Conciliação Bancária permite ao gestor financeiro importar extratos bancários e verificar se cada movimento está explicado — seja por uma fatura do sistema, um comprovativo avulso, uma taxa bancária automática, uma transferência interna ou outra justificativa válida. No final, o saldo calculado pelo sistema deve bater com o saldo do extrato bancário.

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/bank-statements/` (domain, application, adapters); composição: `bank-statements.module.ts`; documentação detalhada: `src/modules/bank-statements/README.md`.
- Endpoints (26, sob `/api`): `DELETE /bank-statements/:id`, `DELETE /bank-statements/movements/:movId/reconcile`, `DELETE /bank-statements/rules/:ruleId`, `GET /bank-statements`, `GET /bank-statements/:id`, `GET /bank-statements/accounts/:accountId/calendar`, `GET /bank-statements/accounts/:accountId/calendar/:year/:month`, `GET /bank-statements/accounts/:accountId/calendar/:year/:month/suggestions`, `GET /bank-statements/invoices/:invoiceId/movements`, `GET /bank-statements/invoices/open-balances`, `GET /bank-statements/movements/:movId/candidates`, `GET /bank-statements/movements/:movId/grouped-suggestions`, `GET /bank-statements/occurrences/candidates`, `GET /bank-statements/rules`, … — lista completa e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Importa portas/tipos de: [financial-base](financial-base.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
- 2026-10-26 (ramo `financeiro-faturas-recorrencias`): liquidação agrupada sugere o documento de pagamento inteiro (faturas de emitentes diferentes com o mesmo `payment_group_id`, soma exata) — ADR-0041.
Nenhum registado.
