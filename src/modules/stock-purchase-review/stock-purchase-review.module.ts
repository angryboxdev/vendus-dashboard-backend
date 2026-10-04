import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { GetInvoicePort, ListInvoicesPort } from "../invoices/domain/ports/in/invoice.ports.js";
import type { ListCostCenterCategoriesPort } from "../financial-base/domain/ports/in/cost-center-category.ports.js";
import type { GetSupplierPort } from "../financial-base/domain/ports/in/supplier.ports.js";
import type { ListLocationsPort } from "../locations/domain/ports/in/list-locations.port.js";

import { SupabaseStockPurchaseReviewRepository } from "./adapters/out/supabase-stock-purchase-review.repository.js";
import { SupabaseStockReviewLearnedMappingRepository } from "./adapters/out/supabase-stock-review-learned-mapping.repository.js";
import { SupabaseStockReviewAuditLogAdapter } from "./adapters/out/supabase-stock-review-audit-log.adapter.js";
import { SupabaseStockCatalogWriteAdapter } from "./adapters/out/supabase-stock-catalog-write.adapter.js";
import { SupabaseStockMovementWriteAdapter } from "./adapters/out/supabase-stock-movement-write.adapter.js";
import { InvoicesGetInvoiceReadAdapter } from "./adapters/out/invoices-get-invoice-read.adapter.js";
import { FinancialBaseCostCenterCategoryReadAdapter } from "./adapters/out/financial-base-cost-center-category-read.adapter.js";
import { FinancialBaseSupplierReadAdapter } from "./adapters/out/financial-base-supplier-read.adapter.js";
import { LocationsReadAdapter } from "./adapters/out/locations-read.adapter.js";

import { RecordInvoiceFinalizedForStockUseCase } from "./application/use-cases/record-invoice-finalized-for-stock.use-case.js";
import { ReprocessMissingStockReviewsUseCase } from "./application/use-cases/reprocess-missing-stock-reviews.use-case.js";
import { ListStockPurchaseReviewsUseCase } from "./application/use-cases/list-stock-purchase-reviews.use-case.js";
import { GetStockPurchaseReviewUseCase } from "./application/use-cases/get-stock-purchase-review.use-case.js";
import { ResolveReviewLineUseCase } from "./application/use-cases/resolve-review-line.use-case.js";
import { DecideUnresolvedReviewUseCase } from "./application/use-cases/decide-unresolved-review.use-case.js";
import { SuggestLineMappingUseCase } from "./application/use-cases/suggest-line-mapping.use-case.js";
import { ConfirmStockPurchaseReviewUseCase } from "./application/use-cases/confirm-stock-purchase-review.use-case.js";
import { CancelStockPurchaseReviewUseCase } from "./application/use-cases/cancel-stock-purchase-review.use-case.js";
import { CancelEmptyStockPurchaseReviewsUseCase } from "./application/use-cases/cancel-empty-stock-purchase-reviews.use-case.js";

import { StockPurchaseReviewController } from "./adapters/in/stock-purchase-review.controller.js";
import type { RecordInvoiceFinalizedForStockPort, ReprocessMissingStockReviewsPort } from "./domain/ports/in/stock-purchase-review.ports.js";

export interface StockPurchaseReviewModule {
  router: Router;
  recordInvoiceFinalizedForStock: RecordInvoiceFinalizedForStockPort;
  reprocessMissingStockReviews: ReprocessMissingStockReviewsPort;
}

/**
 * Composition root do módulo `stock-purchase-review` ("Compra por rever").
 * Instanciado em `server.ts` ANTES de `invoices` — `invoices` precisa do seu
 * `recordInvoiceFinalizedForStock` para o gancho fire-and-forget de
 * finalização de fatura. Como este módulo, por sua vez, também lê `invoices`
 * (D10, só leitura, para revalidação e para a varredura de recuperação),
 * `server.ts` resolve o ciclo com um pequeno indirection object — ver o
 * comentário lá.
 */
export function createStockPurchaseReviewModule(
  getInvoicePort: GetInvoicePort,
  listInvoicesPort: ListInvoicesPort,
  listCostCenterCategoriesPort: ListCostCenterCategoriesPort,
  getSupplierPort: GetSupplierPort,
  listLocationsPort: ListLocationsPort,
): StockPurchaseReviewModule {
  const reviewRepository = new SupabaseStockPurchaseReviewRepository(createScopedQuery);
  const learnedMapping = new SupabaseStockReviewLearnedMappingRepository(createScopedQuery);
  const auditLog = new SupabaseStockReviewAuditLogAdapter(createScopedQuery);
  const stockCatalogWrite = new SupabaseStockCatalogWriteAdapter(createScopedQuery);
  const stockMovementWrite = new SupabaseStockMovementWriteAdapter(createScopedQuery);
  const invoiceRead = new InvoicesGetInvoiceReadAdapter(getInvoicePort, listInvoicesPort);
  const categoryRead = new FinancialBaseCostCenterCategoryReadAdapter(listCostCenterCategoriesPort);
  const supplierRead = new FinancialBaseSupplierReadAdapter(getSupplierPort);
  const locationRead = new LocationsReadAdapter(listLocationsPort);

  const recordInvoiceFinalizedForStock = new RecordInvoiceFinalizedForStockUseCase(stockMovementWrite, categoryRead, supplierRead);
  const reprocessMissingStockReviews = new ReprocessMissingStockReviewsUseCase(invoiceRead, reviewRepository, recordInvoiceFinalizedForStock);

  const controller = new StockPurchaseReviewController(
    new ListStockPurchaseReviewsUseCase(reviewRepository),
    new GetStockPurchaseReviewUseCase(reviewRepository),
    new ResolveReviewLineUseCase(reviewRepository, stockCatalogWrite, learnedMapping, auditLog),
    new DecideUnresolvedReviewUseCase(reviewRepository, auditLog),
    new SuggestLineMappingUseCase(reviewRepository, learnedMapping),
    new ConfirmStockPurchaseReviewUseCase(reviewRepository, stockMovementWrite, invoiceRead, locationRead, auditLog),
    new CancelStockPurchaseReviewUseCase(reviewRepository, auditLog),
    new CancelEmptyStockPurchaseReviewsUseCase(reviewRepository, auditLog),
  );

  return { router: controller.router, recordInvoiceFinalizedForStock, reprocessMissingStockReviews };
}
