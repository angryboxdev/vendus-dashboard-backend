# Módulo: cash-flow

**Área:** Financeiro · **Estado (README):** active · **Código:** `src/modules/cash-flow/`

## Objetivo
«Fluxo de caixa» do Mapa de rentabilidade, só a partir do banco: entradas contra saídas de todas as contas, resultado e margem, despesas por centro de custo e % das saídas justificada.

## Estado atual
Ramo `financeiro-fluxo-caixa` nos dois repositórios (commits, sem push): F1 (backend: endpoint e testes), F2 (frontend: página «Fluxo de caixa» em `/dre/fluxo-caixa`) e F3 (painel «Para tratar»: a pagar / em atraso e faturas por rever, `GET /reports/dre/fluxo-caixa/para-tratar`, `finance.payables`). DRE F1 (backend) feita: `GET /reports/dre/resultado` (`dre.statement`) — receita do restaurante pelo Vendus e das plataformas pelas liquidações no banco, gastos pelas saídas do banco, tudo sem IVA; ajustes manuais; saldo do IVA. Próximo: DRE F2 (frontend).

## Arquitetura
- Código: `src/modules/cash-flow/`; composição: `cash-flow.module.ts`; documentação: `src/modules/cash-flow/README.md`.
- Endpoints (sob `/api`): `GET /reports/dre/fluxo-caixa?year&month` e `GET /reports/dre/resultado?year&month` — permissão `dre.statement`; `GET /reports/dre/fluxo-caixa/para-tratar` — permissão `finance.payables`.

## Dependências
Portas de [bank-statements](bank-statements.md) (`DescribeMovementPort`), [payable-entries](payable-entries.md) (`GetPayableSummaryPort`) e [invoices](invoices.md) (`GetInvoiceAlertsPort`), [vendus](vendus.md) e [air-menu](air-menu.md) (`GetSummaryPort`). Lê (só leitura) tabelas de bank-statements, invoices, payable-entries, payable-recurrences e financial-base.

## Regras de negócio
Ver «Conceitos de domínio» e «Decisões de design» no README do módulo.

## Problemas conhecidos
Mês incompleto se faltar importar o extrato de alguma conta (sem aviso).

## Próximos trabalhos
DRE F2 (frontend: página da DRE no Mapa).
