import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { GetSummaryPort } from "../vendus/domain/ports/in/get-summary.port.js";
import type { ListInvoicesPort, ListInvoiceLinesPort } from "../invoices/domain/ports/in/invoice.ports.js";
import type { ListCostCenterCategoriesPort } from "../financial-base/domain/ports/in/cost-center-category.ports.js";

import { SupabaseAccountingDocumentRepository } from "./adapters/out/supabase-accounting-document.repository.js";
import { SupabaseAccountingDocumentAttachmentRepository } from "./adapters/out/supabase-accounting-document-attachment.repository.js";
import { SupabaseAccountingDocumentStorageAdapter } from "./adapters/out/supabase-accounting-document-storage.adapter.js";
import { SupabaseAccountingAuditLogAdapter } from "./adapters/out/supabase-accounting-audit-log.adapter.js";
import { SupabaseAccountingSettingsRepository } from "./adapters/out/supabase-accounting-settings.repository.js";
import { VendusSalesVatReadAdapter } from "./adapters/out/vendus-sales-vat-read.adapter.js";

import { CreateAccountingDocumentUseCase } from "./application/use-cases/create-accounting-document.use-case.js";
import { UpdateAccountingDocumentUseCase } from "./application/use-cases/update-accounting-document.use-case.js";
import { GetAccountingDocumentUseCase } from "./application/use-cases/get-accounting-document.use-case.js";
import { ValidateAccountingDocumentUseCase } from "./application/use-cases/validate-accounting-document.use-case.js";
import { MarkAccountingDocumentPendencyUseCase } from "./application/use-cases/mark-accounting-document-pendency.use-case.js";
import { CancelAccountingDocumentUseCase } from "./application/use-cases/cancel-accounting-document.use-case.js";
import { UploadAccountingDocumentAttachmentUseCase } from "./application/use-cases/upload-accounting-document-attachment.use-case.js";
import { ListAccountingDocumentsUseCase } from "./application/use-cases/list-accounting-documents.use-case.js";
import { GetVatOverviewUseCase } from "./application/use-cases/get-vat-overview.use-case.js";
import { GetAccountingSettingsUseCase } from "./application/use-cases/get-accounting-settings.use-case.js";
import { UpdateAccountingSettingsUseCase } from "./application/use-cases/update-accounting-settings.use-case.js";

import { AccountingController } from "./adapters/in/accounting.controller.js";

export interface AccountingModule {
  router: Router;
}

/**
 * Composition root do módulo accounting — "Documentos" (vista agregada +
 * `AccountingDocument`, qualquer documento sem o fluxo bancário normal da
 * empresa), "Apuramento de IVA" (periodicidade configurável) e
 * "Configurações". Instanciado em `server.ts` DEPOIS de `vendus`, `invoices`
 * e `financial-base`, para poder injetar as suas portas de leitura (D10) —
 * nunca duplica os cálculos desses módulos. "Envios" fica fora desta ronda
 * (ver README/plano).
 */
export function createAccountingModule(
  vendusGetSummary: GetSummaryPort,
  listInvoices: ListInvoicesPort,
  listInvoiceLines: ListInvoiceLinesPort,
  listCostCenterCategories: ListCostCenterCategoriesPort,
): AccountingModule {
  const documentRepository = new SupabaseAccountingDocumentRepository(createScopedQuery);
  const attachmentRepository = new SupabaseAccountingDocumentAttachmentRepository(createScopedQuery);
  const documentStorage = new SupabaseAccountingDocumentStorageAdapter();
  const auditLog = new SupabaseAccountingAuditLogAdapter(createScopedQuery);
  const settingsRepository = new SupabaseAccountingSettingsRepository(createScopedQuery);
  const salesVatRead = new VendusSalesVatReadAdapter(vendusGetSummary);

  const controller = new AccountingController(
    new CreateAccountingDocumentUseCase(documentRepository, listCostCenterCategories, listInvoices, auditLog),
    new UpdateAccountingDocumentUseCase(documentRepository, attachmentRepository, listCostCenterCategories, listInvoices, auditLog),
    new GetAccountingDocumentUseCase(documentRepository, attachmentRepository),
    new ValidateAccountingDocumentUseCase(documentRepository, attachmentRepository, auditLog),
    new MarkAccountingDocumentPendencyUseCase(documentRepository, attachmentRepository, auditLog),
    new CancelAccountingDocumentUseCase(documentRepository, attachmentRepository, auditLog),
    new UploadAccountingDocumentAttachmentUseCase(documentRepository, attachmentRepository, documentStorage, auditLog),
    new ListAccountingDocumentsUseCase(listInvoices, documentRepository),
    new GetVatOverviewUseCase(salesVatRead, listInvoices, listInvoiceLines, listCostCenterCategories, documentRepository, settingsRepository),
    new GetAccountingSettingsUseCase(settingsRepository),
    new UpdateAccountingSettingsUseCase(settingsRepository),
  );

  return { router: controller.router };
}
