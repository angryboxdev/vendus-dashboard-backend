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
import { SupabaseOrganizationIdentityReadAdapter } from "./adapters/out/supabase-organization-identity-read.adapter.js";
import { FinancialBaseSupplierCreateAdapter } from "./adapters/out/financial-base-supplier-create.adapter.js";
import { StockPurchaseReviewDecisionAdapter } from "./adapters/out/stock-purchase-review-decision-adapter.js";
import { StockPurchaseReviewStatusReadAdapter } from "./adapters/out/stock-purchase-review-status-read.adapter.js";
import { StockPurchaseReviewDraftDeleteAdapter } from "./adapters/out/stock-purchase-review-draft-delete.adapter.js";
import { OpenAiExtractionAdapter } from "./adapters/out/openai-extraction.adapter.js";
import { CreateInvoiceUseCase } from "./application/use-cases/create-invoice.use-case.js";
import { UpdateInvoiceUseCase } from "./application/use-cases/update-invoice.use-case.js";
import { MarkInvoicePaidUseCase } from "./application/use-cases/mark-invoice-paid.use-case.js";
import { SetInvoiceStatusUseCase } from "./application/use-cases/set-invoice-status.use-case.js";
import { AddInvoiceLineUseCase } from "./application/use-cases/add-invoice-line.use-case.js";
import { UpdateInvoiceLineUseCase } from "./application/use-cases/update-invoice-line.use-case.js";
import { DeleteInvoiceLineUseCase } from "./application/use-cases/delete-invoice-line.use-case.js";
import { ClassifyInvoiceLineUseCase } from "./application/use-cases/classify-invoice-line.use-case.js";
import { SetInvoiceLineDeductibilityOverrideUseCase } from "./application/use-cases/set-invoice-line-deductibility-override.use-case.js";
import { SuggestLineClassificationUseCase } from "./application/use-cases/suggest-line-classification.use-case.js";
import { ListInvoicesUseCase } from "./application/use-cases/list-invoices.use-case.js";
import { ListInvoiceLinesUseCase } from "./application/use-cases/list-invoice-lines.use-case.js";
import { GetInvoiceUseCase } from "./application/use-cases/get-invoice.use-case.js";
import { DeleteInvoiceUseCase } from "./application/use-cases/delete-invoice.use-case.js";
import { ImportInvoiceUseCase } from "./application/use-cases/import-invoice.use-case.js";
import { ReadPaymentDocumentUseCase } from "./application/use-cases/read-payment-document.use-case.js";
import { SupabaseAiBudgetAdapter } from "./adapters/out/supabase-ai-budget.adapter.js";
import { ImportInvoiceKeepingLinesUseCase } from "./application/use-cases/import-invoice-keeping-lines.use-case.js";
import { LinkObligationUseCase } from "./application/use-cases/link-obligation.use-case.js";
import { ImportInvoiceForStockUseCase } from "./application/use-cases/import-invoice-for-stock.use-case.js";
import { CreateObligationDraftUseCase } from "./application/use-cases/create-obligation-draft.use-case.js";
import { PdfjsContentReaderAdapter } from "./adapters/out/pdfjs-content-reader.adapter.js";
import { SupabaseObligationCandidatesAdapter } from "./adapters/out/supabase-obligation-candidates.adapter.js";
import { SupabaseInvoiceReadingWriteAdapter } from "./adapters/out/supabase-invoice-reading-write.adapter.js";
import { SupabaseCategoryCatalogAdapter, SupabaseConfirmedLineHistoryAdapter } from "./adapters/out/supabase-line-classification.adapters.js";
import { OpenAiLineCategoryAdapter } from "./adapters/out/openai-line-category.adapter.js";
import { ClassifyInvoiceLinesUseCase } from "./application/use-cases/classify-invoice-lines.use-case.js";
import { MakroLayout } from "./domain/services/reading/makro-layout.js";
import { GenericQrLayout } from "./domain/services/reading/generic-qr-layout.js";
import { ConfirmImportedInvoiceUseCase } from "./application/use-cases/confirm-imported-invoice.use-case.js";
import { GetInvoiceAlertsUseCase } from "./application/use-cases/get-invoice-alerts.use-case.js";
import { ProcessDirectDebitsUseCase } from "./application/use-cases/process-direct-debits.use-case.js";
import { SetLineDetailModeUseCase } from "./application/use-cases/set-line-detail-mode.use-case.js";
import { ListPayableDuplicatesUseCase } from "./application/use-cases/list-payable-duplicates.use-case.js";
import { createInvoiceRouter } from "./adapters/in/invoice.controller.js";
import { StockPurchaseReviewRoutingAdapter } from "./adapters/out/stock-purchase-review-routing.adapter.js";
import { PayableRecurrencesLinkAdapter } from "./adapters/out/payable-recurrences-link.adapter.js";
import { SupabaseRecurrenceCategoryHintAdapter } from "./adapters/out/supabase-recurrence-category-hint.adapter.js";
import {
  ConfirmImportedInvoiceWithRecurrenceLink,
  CreateInvoiceWithRecurrenceLink,
  DeleteInvoiceWithRecurrenceRelease,
} from "./application/use-cases/recurrence-link.decorators.js";
import type { AutoLinkInvoicePort, ReleaseInvoiceLinksPort } from "../payable-recurrences/domain/ports/in/invoice-link.ports.js";
import type { SuggestStockRoutingPort } from "../stock-purchase-review/domain/ports/in/suggest-stock-routing.port.js";
import { SupabaseInvoiceAuditAdapter } from "./adapters/out/supabase-invoice-audit.adapter.js";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { GetPayablesSummaryUseCase } from "./application/use-cases/get-payables-summary.use-case.js";
import { SupabasePayablesLedgerReadAdapter } from "./adapters/out/supabase-payables-ledger-read.adapter.js";
import { ListInvoiceAllocationsUseCase } from "./application/use-cases/list-invoice-allocations.use-case.js";
import { SaveInvoiceDraftUseCase } from "./application/use-cases/save-invoice-draft.use-case.js";
import { ReplaceInvoiceAllocationsUseCase } from "./application/use-cases/replace-invoice-allocations.use-case.js";
import { SupabaseInvoiceAllocationRepository } from "./adapters/out/supabase-invoice-allocation.repository.js";
import { SupabaseInvoiceAmountsWriteAdapter } from "./adapters/out/supabase-invoice-amounts-write.adapter.js";
import { FiscalDocumentsIdentityAdapter } from "./adapters/out/fiscal-documents-identity.adapter.js";
import type { FiscalDocumentsPort } from "../fiscal-documents/domain/ports/in/fiscal-documents.ports.js";
import type { CreateSupplierPort, UpdateSupplierPort } from "../financial-base/domain/ports/in/supplier.ports.js";
import { FillSupplierLogosUseCase } from "./application/use-cases/fill-supplier-logos.use-case.js";
import { SupabaseInvoiceAttachmentReadAdapter, SupabaseSupplierInvoiceAttachmentsAdapter } from "./adapters/out/supabase-supplier-logo.adapters.js";
import { FinancialBaseSupplierLogoAdapter } from "./adapters/out/financial-base-supplier-logo.adapter.js";
import type {
  RecordInvoiceFinalizedForStockPort,
  GetStockPurchaseReviewStatusPort,
  DeleteDraftStockPurchaseReviewPort,
} from "../stock-purchase-review/domain/ports/in/stock-purchase-review.ports.js";
import type { ProcessDirectDebitsPort, ListInvoicesPort, ListInvoiceLinesPort, GetInvoicePort } from "./domain/ports/in/invoice.ports.js";
import type { Router } from "express";

export interface InvoicesModule {
  router: Router;
  processDirectDebits: ProcessDirectDebitsPort;
  /** Módulo Contabilidade (D10) — lê faturas/notas de crédito já existentes, nunca duplica o CRUD. */
  listInvoices: ListInvoicesPort;
  listInvoiceLines: ListInvoiceLinesPort;
  /** Módulo Stock — Compra por rever (D10): revalidação antes de confirmar e varredura de recuperação. */
  getInvoice: GetInvoicePort;
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
export function createInvoicesModule(
  createSupplierPort: CreateSupplierPort,
  recordInvoiceFinalizedForStock: RecordInvoiceFinalizedForStockPort,
  getStockPurchaseReviewStatus: GetStockPurchaseReviewStatusPort,
  deleteDraftStockPurchaseReview: DeleteDraftStockPurchaseReviewPort,
  fiscalDocuments: FiscalDocumentsPort,
  suggestStockRouting: SuggestStockRoutingPort,
  updateSupplierPort: UpdateSupplierPort,
  recurrenceLinks: { autoLinkInvoice: AutoLinkInvoicePort; releaseInvoiceLinks: ReleaseInvoiceLinksPort },
): InvoicesModule {
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
  const organizationIdentityRead = new SupabaseOrganizationIdentityReadAdapter(createScopedQuery);
  const supplierCreate = new FinancialBaseSupplierCreateAdapter(createSupplierPort);
  const stockDecisionNotify = new StockPurchaseReviewDecisionAdapter(recordInvoiceFinalizedForStock);
  const stockReviewStatusRead = new StockPurchaseReviewStatusReadAdapter(getStockPurchaseReviewStatus);
  const stockReviewDraftDelete = new StockPurchaseReviewDraftDeleteAdapter(deleteDraftStockPurchaseReview);
  const aiExtraction = new OpenAiExtractionAdapter(openaiApiKey);
  const pdfReader = new PdfjsContentReaderAdapter();
  const readPaymentDocument = new ReadPaymentDocumentUseCase(pdfReader, new SupabaseObligationCandidatesAdapter(createScopedQuery), supplierLookup, organizationIdentityRead);
  const fiscal = new FiscalDocumentsIdentityAdapter(fiscalDocuments);
  const amountsWrite = new SupabaseInvoiceAmountsWriteAdapter(createScopedQuery);
  const allocationRepo = new SupabaseInvoiceAllocationRepository(createScopedQuery);
  const audit = new SupabaseInvoiceAuditAdapter(createScopedQuery);
  const stockRouting = new StockPurchaseReviewRoutingAdapter(suggestStockRouting);
  const recurrenceLink = new PayableRecurrencesLinkAdapter(recurrenceLinks.autoLinkInvoice, recurrenceLinks.releaseInvoiceLinks);
  const idempotencyStore = new SupabaseIdempotencyStore(createScopedQuery);
  // Orçamento diário de IA por organização (AI_DAILY_LIMIT_PER_ORG, omissão 300 chamadas/dia).
  const aiBudget = new SupabaseAiBudgetAdapter(createScopedQuery, aiDailyLimit());
  // F3c: linhas já em Compras por rever ficam protegidas ao guardar/confirmar no Financeiro.
  const stockLines = { statusRead: stockReviewStatusRead, draftDelete: stockReviewDraftDelete };
  // Logótipo do fornecedor a partir das faturas: ao confirmar e no preenchimento da lista de fornecedores.
  const supplierLogos = new FillSupplierLogosUseCase(
    supplierLookup,
    new SupabaseSupplierInvoiceAttachmentsAdapter(createScopedQuery),
    new SupabaseInvoiceAttachmentReadAdapter(),
    pdfReader,
    storage,
    new FinancialBaseSupplierLogoAdapter(updateSupplierPort),
  );

  const processDirectDebits = new ProcessDirectDebitsUseCase(invoiceRepo, payableWrite);
  const listInvoices = new ListInvoicesUseCase(invoiceRepo, categoryReader, allocationRepo, lineRepo);
  const listInvoiceLines = new ListInvoiceLinesUseCase(lineRepo, invoiceRepo);
  const getInvoice = new GetInvoiceUseCase(invoiceRepo, lineRepo, categoryReader, allocationRepo, amountsWrite);

  // Leitor inteligente (E3): QR + texto do PDF antes da IA; categoria sugerida por linha
  // (IA só no que as regras não resolvem; INVOICE_LINE_AI=off desliga essa parte).
  const importInvoice = new ImportInvoiceUseCase(invoiceRepo, storage, aiExtraction, supplierLookup, supplierHint, organizationIdentityRead, fiscal, {
    pdf: pdfReader,
    // Layouts específicos primeiro; o genérico serve qualquer fatura com QR fiscal (só se reconciliar).
    layouts: [new MakroLayout(), new GenericQrLayout()],
    readingWrite: new SupabaseInvoiceReadingWriteAdapter(createScopedQuery),
    classifyLines: new ClassifyInvoiceLinesUseCase(
      new SupabaseCategoryCatalogAdapter(createScopedQuery),
      new SupabaseConfirmedLineHistoryAdapter(createScopedQuery),
      process.env.INVOICE_LINE_AI === "off" ? null : new OpenAiLineCategoryAdapter(openaiApiKey, process.env.OPENAI_MODEL_TEXT ?? "gpt-4o-mini"),
      aiBudget,
    ),
    aiBudget,
    recurrenceCategoryHint: new SupabaseRecurrenceCategoryHintAdapter(createScopedQuery),
  });
  const saveInvoiceDraft = new SaveInvoiceDraftUseCase(invoiceRepo, lineRepo, amountsWrite, categoryReader, allocationRepo, audit, stockLines);

  const router = createInvoiceRouter({
    listPayableDuplicates: new ListPayableDuplicatesUseCase(payableWrite),
    listInvoiceAllocations: new ListInvoiceAllocationsUseCase(allocationRepo, invoiceRepo),
    getPayablesSummary: new GetPayablesSummaryUseCase(invoiceRepo, lineRepo, allocationRepo, new SupabasePayablesLedgerReadAdapter(createScopedQuery), organizationIdentityRead),
    saveInvoiceDraft,
    replaceInvoiceAllocations: new ReplaceInvoiceAllocationsUseCase(invoiceRepo, categoryReader, allocationRepo, audit),
    suggestStockRouting: stockRouting,
    createInvoice: new CreateInvoiceWithRecurrenceLink(
      new CreateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, stockDecisionNotify, fiscal, supplierLookup, amountsWrite, audit, stockRouting, categoryReader, allocationRepo),
      recurrenceLink,
    ),
    updateInvoice: new UpdateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, reconciliationCleanup, stockReviewStatusRead, stockReviewDraftDelete, fiscal, supplierLookup, audit, allocationRepo),
    markInvoicePaid: new MarkInvoicePaidUseCase(invoiceRepo, payableWrite, occurrenceSync),
    setInvoiceStatus: new SetInvoiceStatusUseCase(invoiceRepo, payableWrite),
    setLineDetailMode: new SetLineDetailModeUseCase(invoiceRepo),
    addInvoiceLine: new AddInvoiceLineUseCase(invoiceRepo, lineRepo, stockLines),
    updateInvoiceLine: new UpdateInvoiceLineUseCase(invoiceRepo, lineRepo),
    deleteInvoiceLine: new DeleteInvoiceLineUseCase(invoiceRepo, lineRepo, stockLines),
    classifyInvoiceLine: new ClassifyInvoiceLineUseCase(invoiceRepo, lineRepo, ruleRepo, categoryReader),
    setInvoiceLineDeductibilityOverride: new SetInvoiceLineDeductibilityOverrideUseCase(lineRepo),
    listInvoices,
    listInvoiceLines,
    getInvoice,
    deleteInvoice: new DeleteInvoiceWithRecurrenceRelease(
      new DeleteInvoiceUseCase(invoiceRepo, lineRepo, storage, payableWrite, reconciliationCleanup, stockReviewStatusRead, stockReviewDraftDelete, fiscal, audit),
      recurrenceLink,
      async (org, id) => (await invoiceRepo.findById(org, id))?.paymentGroupId ?? null,
    ),
    suggestLineClassification: new SuggestLineClassificationUseCase(ruleRepo),
    importInvoice,
    importInvoiceKeepingLines: new ImportInvoiceKeepingLinesUseCase(importInvoice, saveInvoiceDraft, invoiceRepo),
    fillSupplierLogos: supplierLogos,
    importInvoiceForStock: new ImportInvoiceForStockUseCase(importInvoice, saveInvoiceDraft, invoiceRepo, lineRepo, storage, stockReviewStatusRead, stockDecisionNotify, fiscal, supplierLookup),
    readPaymentDocument,
    createObligationDraft: new CreateObligationDraftUseCase(readPaymentDocument, storage, invoiceRepo, supplierLookup),
    linkObligation: new LinkObligationUseCase(readPaymentDocument, invoiceRepo, storage, audit),
    confirmImportedInvoice: new ConfirmImportedInvoiceWithRecurrenceLink(
      new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, supplierCreate, supplierHint, stockDecisionNotify, fiscal, supplierLookup, amountsWrite, audit, stockRouting, categoryReader, allocationRepo, stockLines, supplierLogos),
      recurrenceLink,
    ),
    getInvoiceAlerts: new GetInvoiceAlertsUseCase(invoiceRepo),
    processDirectDebits,
  }, idempotencyStore);

  return { router, processDirectDebits, listInvoices, listInvoiceLines, getInvoice };
}

/** Limite diário de chamadas à IA por organização (todas as funcionalidades). */
function aiDailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT_PER_ORG);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}
