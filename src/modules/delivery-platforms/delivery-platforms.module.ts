import type { Router } from "express";
import type { DescribeMovementPort } from "../bank-statements/domain/ports/in/describe-movement.port.js";
import type { GetRecipeCostingPort } from "../recipe-costing/domain/ports/in/get-recipe-costing.port.js";
import type { GetStockItemCostsPort } from "../recipe-costing/domain/ports/in/get-stock-item-costs.port.js";
import { RecipeCostingProductCostsAdapter } from "./adapters/out/recipe-costing-product-costs.adapter.js";
import { SupabaseProductMappingRepository } from "./adapters/out/supabase-product-mapping.repository.js";
import { GetFoodCostUseCase, SaveProductMappingsUseCase } from "./application/use-cases/food-cost.use-case.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { DocumentTextAdapter } from "./adapters/out/document-text.adapter.js";
import { SupabasePlatformStatementRepository } from "./adapters/out/supabase-platform-statement.repository.js";
import { ImportPlatformDocumentsUseCase } from "./application/use-cases/import-platform-documents.use-case.js";
import { ListPlatformStatementsUseCase } from "./application/use-cases/list-platform-statements.use-case.js";
import { ExportPlatformMarginReportUseCase, GetPlatformMarginReportUseCase } from "./application/use-cases/platform-margin-report.use-case.js";
import { MarginReportWriterAdapter } from "./adapters/out/margin-report-writer.adapter.js";
import { SupabasePlatformBankCreditsAdapter } from "./adapters/out/supabase-platform-bank-credits.adapter.js";
import { GetPayoutReconciliationUseCase } from "./application/use-cases/payout-reconciliation.use-case.js";
import type { GetPlatformMarginReportPort } from "./domain/ports/in/platform-margin-report.port.js";
import type { ListPlatformStatementsPort } from "./domain/ports/in/list-platform-statements.port.js";
import { DeliveryPlatformsController } from "./adapters/in/delivery-platforms.controller.js";

export interface DeliveryPlatformsModule {
  router: Router;
  /** Para outros módulos (ex.: a DRE em `cash-flow`, F3) lerem os extratos do mês. */
  listStatements: ListPlatformStatementsPort;
  /** Margem por plataforma do mês (para a DRE, F3b). */
  getMarginReport: GetPlatformMarginReportPort;
}

export interface DeliveryPlatformsModuleDeps {
  /** Regras do `bank-statements` para reconhecer os créditos das plataformas no banco (F4). */
  describeMovement: DescribeMovementPort;
  /** Fichas técnicas e custo dos artigos (`recipe-costing`): custo real da comida do delivery (F5). */
  getRecipeCosting: GetRecipeCostingPort;
  getStockItemCosts: GetStockItemCostsPort;
}

/**
 * Composition root do módulo `delivery-platforms`: importação dos extratos das plataformas de
 * delivery (Uber, Glovo…) para `delivery_platform_statements`.
 */
export function createDeliveryPlatformsModule(deps: DeliveryPlatformsModuleDeps): DeliveryPlatformsModule {
  const statements = new SupabasePlatformStatementRepository(createScopedQuery);
  const listStatements = new ListPlatformStatementsUseCase(statements);
  const mappings = new SupabaseProductMappingRepository(createScopedQuery);
  const getFoodCost = new GetFoodCostUseCase(statements, mappings, new RecipeCostingProductCostsAdapter(deps.getRecipeCosting, deps.getStockItemCosts));
  const getMarginReport = new GetPlatformMarginReportUseCase(statements, getFoodCost);
  const controller = new DeliveryPlatformsController(
    new ImportPlatformDocumentsUseCase(new DocumentTextAdapter(), statements),
    listStatements,
    getMarginReport,
    new ExportPlatformMarginReportUseCase(getMarginReport, new MarginReportWriterAdapter()),
    new GetPayoutReconciliationUseCase(statements, new SupabasePlatformBankCreditsAdapter(createScopedQuery, deps.describeMovement)),
    getFoodCost,
    new SaveProductMappingsUseCase(mappings),
  );
  return { router: controller.router, listStatements, getMarginReport };
}
