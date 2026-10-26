import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { DescribeMovementPort } from "../bank-statements/domain/ports/in/describe-movement.port.js";
import type { GetPayableSummaryPort } from "../payable-entries/domain/ports/in/payable-entry.ports.js";
import type { GetInvoiceAlertsPort } from "../invoices/domain/ports/in/invoice.ports.js";

import { SupabaseBankMovementReadAdapter } from "./adapters/out/supabase-bank-movement-read.adapter.js";
import { SupabaseExpenseSourceReadAdapter } from "./adapters/out/supabase-expense-source-read.adapter.js";
import { SupabaseCostCenterCatalogReadAdapter } from "./adapters/out/supabase-cost-center-catalog-read.adapter.js";
import { BankStatementsMovementKindAdapter } from "./adapters/out/bank-statements-movement-kind.adapter.js";
import { PayableEntriesSummaryAdapter } from "./adapters/out/payable-entries-summary.adapter.js";
import { InvoiceAlertsToReviewAdapter } from "./adapters/out/invoice-alerts-to-review.adapter.js";
import { GetCashFlowUseCase } from "./application/use-cases/get-cash-flow.use-case.js";
import { GetCashFlowToHandleUseCase } from "./application/use-cases/get-cash-flow-to-handle.use-case.js";
import { CashFlowController } from "./adapters/in/cash-flow.controller.js";

export interface CashFlowModule {
  router: Router;
}

/**
 * Composition root do módulo cash-flow — «Fluxo de caixa» do Mapa de rentabilidade, só a partir do
 * banco. Instanciado em `server.ts` DEPOIS de `bank-statements`, `payable-entries` e `invoices`,
 * para receber as suas portas de entrada (D10): tipo genérico dos movimentos, resumo das contas a
 * pagar e alertas das faturas. As tabelas do banco, das faturas e dos centros de custo são só lidas
 * (nunca escritas) pelos adapters daqui.
 */
export function createCashFlowModule(
  describeMovement: DescribeMovementPort,
  getPayableSummary: GetPayableSummaryPort,
  getInvoiceAlerts: GetInvoiceAlertsPort,
): CashFlowModule {
  const getCashFlow = new GetCashFlowUseCase(
    new SupabaseBankMovementReadAdapter(createScopedQuery),
    new SupabaseExpenseSourceReadAdapter(createScopedQuery),
    new SupabaseCostCenterCatalogReadAdapter(createScopedQuery),
    new BankStatementsMovementKindAdapter(describeMovement),
  );
  const getToHandle = new GetCashFlowToHandleUseCase(
    new PayableEntriesSummaryAdapter(getPayableSummary),
    new InvoiceAlertsToReviewAdapter(getInvoiceAlerts),
  );
  return { router: new CashFlowController(getCashFlow, getToHandle).router };
}
