import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { DescribeMovementPort } from "../bank-statements/domain/ports/in/describe-movement.port.js";
import type { GetPayableSummaryPort } from "../payable-entries/domain/ports/in/payable-entry.ports.js";
import type { GetInvoiceAlertsPort } from "../invoices/domain/ports/in/invoice.ports.js";
import type { GetSummaryPort as VendusGetSummaryPort } from "../vendus/domain/ports/in/get-summary.port.js";
import type { GetPlatformMarginReportPort } from "../delivery-platforms/domain/ports/in/platform-margin-report.port.js";

import { SupabaseBankMovementReadAdapter } from "./adapters/out/supabase-bank-movement-read.adapter.js";
import { SupabaseExpenseSourceReadAdapter } from "./adapters/out/supabase-expense-source-read.adapter.js";
import { SupabaseCostCenterCatalogReadAdapter } from "./adapters/out/supabase-cost-center-catalog-read.adapter.js";
import { BankStatementsMovementKindAdapter } from "./adapters/out/bank-statements-movement-kind.adapter.js";
import { PayableEntriesSummaryAdapter } from "./adapters/out/payable-entries-summary.adapter.js";
import { InvoiceAlertsToReviewAdapter } from "./adapters/out/invoice-alerts-to-review.adapter.js";
import { VendusRestaurantSalesAdapter } from "./adapters/out/vendus-restaurant-sales.adapter.js";
import { VendusDailyPaymentsAdapter } from "./adapters/out/vendus-daily-payments.adapter.js";
import { DeliveryPlatformsStatementsAdapter } from "./adapters/out/delivery-platforms-statements.adapter.js";
import { SupabaseDreParametersRepository } from "./adapters/out/supabase-dre-parameters.repository.js";
import { SupabaseCategoryVatRatioReadAdapter } from "./adapters/out/supabase-category-vat-ratio-read.adapter.js";
import { GetCashFlowUseCase } from "./application/use-cases/get-cash-flow.use-case.js";
import { GetCashFlowToHandleUseCase } from "./application/use-cases/get-cash-flow-to-handle.use-case.js";
import { GetDreEntriesUseCase, GetDreUseCase } from "./application/use-cases/get-dre.use-case.js";
import { GetSalesReconciliationUseCase } from "./application/use-cases/get-sales-reconciliation.use-case.js";
import { GetDreParametersUseCase, SaveDreParametersUseCase } from "./application/use-cases/dre-parameters.use-case.js";
import { GetDreRestaurantSalesUseCase } from "./application/use-cases/get-dre-restaurant-sales.use-case.js";
import { CashFlowController } from "./adapters/in/cash-flow.controller.js";

export interface CashFlowModule {
  router: Router;
}

export interface CashFlowModuleDeps {
  describeMovement: DescribeMovementPort;
  getPayableSummary: GetPayableSummaryPort;
  getInvoiceAlerts: GetInvoiceAlertsPort;
  vendusGetSummary: VendusGetSummaryPort;
  /** Margem por plataforma pelos extratos importados (módulo `delivery-platforms`): a DRE usa-a quando há extratos. */
  deliveryMarginReport?: GetPlatformMarginReportPort;
}

/**
 * Composition root do módulo cash-flow — «Fluxo de caixa», «DRE» e «Conferência de vendas» do Mapa de
 * rentabilidade, a partir da conciliação bancária. Instanciado em `server.ts` DEPOIS de
 * `bank-statements`, `payable-entries`, `invoices` e `vendus`, para receber as suas portas de entrada
 * (D10). As tabelas do banco, das faturas, dos centros de custo e dos ajustes manuais são só lidas;
 * escreve só os parâmetros mensais da DRE (`dre_monthly_parameters`).
 */
export function createCashFlowModule(deps: CashFlowModuleDeps): CashFlowModule {
  const bankMovements = new SupabaseBankMovementReadAdapter(createScopedQuery);
  const expenseSources = new SupabaseExpenseSourceReadAdapter(createScopedQuery);
  const catalog = new SupabaseCostCenterCatalogReadAdapter(createScopedQuery);
  const movementKind = new BankStatementsMovementKindAdapter(deps.describeMovement);
  const parameters = new SupabaseDreParametersRepository(createScopedQuery);
  const categoryVatRatios = new SupabaseCategoryVatRatioReadAdapter(createScopedQuery);

  const getCashFlow = new GetCashFlowUseCase(bankMovements, expenseSources, catalog, movementKind);
  const getToHandle = new GetCashFlowToHandleUseCase(
    new PayableEntriesSummaryAdapter(deps.getPayableSummary),
    new InvoiceAlertsToReviewAdapter(deps.getInvoiceAlerts),
  );
  const restaurantSales = new VendusRestaurantSalesAdapter(deps.vendusGetSummary);
  const getDre = new GetDreUseCase(
    bankMovements,
    expenseSources,
    catalog,
    movementKind,
    restaurantSales,
    parameters,
    categoryVatRatios,
    expenseSources,
    undefined,
    deps.deliveryMarginReport ? new DeliveryPlatformsStatementsAdapter(deps.deliveryMarginReport) : null,
  );
  const getSalesReconciliation = new GetSalesReconciliationUseCase(
    bankMovements,
    movementKind,
    new VendusDailyPaymentsAdapter(deps.vendusGetSummary),
    parameters,
  );
  const controller = new CashFlowController(
    getCashFlow,
    getToHandle,
    getDre,
    getSalesReconciliation,
    new GetDreParametersUseCase(parameters),
    new SaveDreParametersUseCase(parameters),
    new GetDreRestaurantSalesUseCase(restaurantSales, parameters),
    new GetDreEntriesUseCase(bankMovements, expenseSources, catalog, movementKind, parameters, categoryVatRatios, expenseSources),
  );
  return { router: controller.router };
}
