import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseInvoiceRepository } from "./adapters/out/supabase-invoice.repository.js";
import { SupabaseInvoiceLineRepository } from "./adapters/out/supabase-invoice-line.repository.js";
import { SupabaseClassificationRuleRepository } from "./adapters/out/supabase-classification-rule.repository.js";
import { SupabasePayableEntryWriteAdapter } from "./adapters/out/supabase-payable-entry-write.adapter.js";
import { SupabaseCostCenterCategoryReaderAdapter } from "./adapters/out/supabase-cost-center-category-reader.adapter.js";
import { SupabaseDocumentStorageAdapter } from "./adapters/out/supabase-document-storage.adapter.js";
import { SupabaseInvoiceReconciliationCleanupAdapter } from "./adapters/out/supabase-invoice-reconciliation-cleanup.adapter.js";
import { SupabaseOccurrenceSyncAdapter } from "./adapters/out/supabase-occurrence-sync.adapter.js";
import { SupabaseSupplierLookupAdapter } from "./adapters/out/supabase-supplier-lookup.adapter.js";
import { SupabaseSupplierHintAdapter } from "./adapters/out/supabase-supplier-hint.adapter.js";
import { FinancialBaseSupplierCreateAdapter } from "./adapters/out/financial-base-supplier-create.adapter.js";
import { OpenAiExtractionAdapter } from "./adapters/out/openai-extraction.adapter.js";
import { CreateInvoiceUseCase } from "./application/use-cases/create-invoice.use-case.js";
import { UpdateInvoiceUseCase } from "./application/use-cases/update-invoice.use-case.js";
import { MarkInvoicePaidUseCase } from "./application/use-cases/mark-invoice-paid.use-case.js";
import { SetInvoiceStatusUseCase } from "./application/use-cases/set-invoice-status.use-case.js";
import { AddInvoiceLineUseCase } from "./application/use-cases/add-invoice-line.use-case.js";
import { UpdateInvoiceLineUseCase } from "./application/use-cases/update-invoice-line.use-case.js";
import { DeleteInvoiceLineUseCase } from "./application/use-cases/delete-invoice-line.use-case.js";
import { ClassifyInvoiceLineUseCase } from "./application/use-cases/classify-invoice-line.use-case.js";
import { SuggestLineClassificationUseCase } from "./application/use-cases/suggest-line-classification.use-case.js";
import { ListInvoicesUseCase } from "./application/use-cases/list-invoices.use-case.js";
import { ListInvoiceLinesUseCase } from "./application/use-cases/list-invoice-lines.use-case.js";
import { GetInvoiceUseCase } from "./application/use-cases/get-invoice.use-case.js";
import { DeleteInvoiceUseCase } from "./application/use-cases/delete-invoice.use-case.js";
import { ImportInvoiceUseCase } from "./application/use-cases/import-invoice.use-case.js";
import { ConfirmImportedInvoiceUseCase } from "./application/use-cases/confirm-imported-invoice.use-case.js";
import { GetInvoiceAlertsUseCase } from "./application/use-cases/get-invoice-alerts.use-case.js";
import { ProcessDirectDebitsUseCase } from "./application/use-cases/process-direct-debits.use-case.js";
import { SetLineDetailModeUseCase } from "./application/use-cases/set-line-detail-mode.use-case.js";
import { createInvoiceRouter } from "./adapters/in/invoice.controller.js";
import type { CreateSupplierPort } from "../financial-base/domain/ports/in/supplier.ports.js";
import type { ProcessDirectDebitsPort } from "./domain/ports/in/invoice.ports.js";
import type { Router } from "express";

export interface InvoicesModule {
  router: Router;
  processDirectDebits: ProcessDirectDebitsPort;
}

/**
 * Composition root do módulo invoices.
 *
 * Segue D2: os adapters de saída não guardam um `SupabaseClient` — recebem o
 * factory `createScopedQuery` injectado aqui e constroem um `ScopedQuery`
 * escopado por chamada. A organização já não é resolvida por nenhuma
 * constante fixa deste módulo — chega como parâmetro explícito em cada
 * porta, vinda do `orgId` da claim verificada (`req.auth.orgId`) nos
 * caminhos autenticados; o cron de débitos diretos passa o
 * `UNATTENDED_SCOPE` (`src/infra/scoped-db/unattended-scope.ts`, D6) porque
 * não tem pedido nenhum.
 */
export function createInvoicesModule(createSupplierPort: CreateSupplierPort): InvoicesModule {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) throw new Error("OPENAI_API_KEY não configurado");

  const invoiceRepo = new SupabaseInvoiceRepository(createScopedQuery);
  const lineRepo = new SupabaseInvoiceLineRepository(createScopedQuery);
  const ruleRepo = new SupabaseClassificationRuleRepository(createScopedQuery);
  const categoryReader = new SupabaseCostCenterCategoryReaderAdapter(createScopedQuery);
  const payableWrite = new SupabasePayableEntryWriteAdapter(createScopedQuery);
  const occurrenceSync = new SupabaseOccurrenceSyncAdapter(createScopedQuery);
  const storage = new SupabaseDocumentStorageAdapter();
  const reconciliationCleanup = new SupabaseInvoiceReconciliationCleanupAdapter(createScopedQuery);
  const supplierLookup = new SupabaseSupplierLookupAdapter(createScopedQuery);
  const supplierHint = new SupabaseSupplierHintAdapter(createScopedQuery);
  const supplierCreate = new FinancialBaseSupplierCreateAdapter(createSupplierPort);
  const aiExtraction = new OpenAiExtractionAdapter(openaiApiKey);

  const processDirectDebits = new ProcessDirectDebitsUseCase(invoiceRepo, payableWrite);

  const router = createInvoiceRouter({
    createInvoice: new CreateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite),
    updateInvoice: new UpdateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, reconciliationCleanup),
    markInvoicePaid: new MarkInvoicePaidUseCase(invoiceRepo, payableWrite, occurrenceSync),
    setInvoiceStatus: new SetInvoiceStatusUseCase(invoiceRepo, payableWrite),
    setLineDetailMode: new SetLineDetailModeUseCase(invoiceRepo, lineRepo),
    addInvoiceLine: new AddInvoiceLineUseCase(invoiceRepo, lineRepo),
    updateInvoiceLine: new UpdateInvoiceLineUseCase(invoiceRepo, lineRepo),
    deleteInvoiceLine: new DeleteInvoiceLineUseCase(invoiceRepo, lineRepo),
    classifyInvoiceLine: new ClassifyInvoiceLineUseCase(invoiceRepo, lineRepo, ruleRepo, categoryReader),
    listInvoices: new ListInvoicesUseCase(invoiceRepo, categoryReader),
    listInvoiceLines: new ListInvoiceLinesUseCase(lineRepo),
    getInvoice: new GetInvoiceUseCase(invoiceRepo, lineRepo, categoryReader),
    deleteInvoice: new DeleteInvoiceUseCase(invoiceRepo, lineRepo, storage, payableWrite, reconciliationCleanup),
    suggestLineClassification: new SuggestLineClassificationUseCase(ruleRepo),
    importInvoice: new ImportInvoiceUseCase(invoiceRepo, storage, aiExtraction, supplierLookup, supplierHint),
    confirmImportedInvoice: new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, supplierCreate, supplierHint),
    getInvoiceAlerts: new GetInvoiceAlertsUseCase(invoiceRepo),
    processDirectDebits,
  });

  return { router, processDirectDebits };
}
