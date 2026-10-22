import type { Router } from "express";
import { Router as createRouter } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseDocumentRepository } from "./adapters/out/supabase-document.repository.js";
import { SupabaseDocumentCategoryRepository } from "./adapters/out/supabase-document-category.repository.js";
import { SupabaseDocumentFileStorageAdapter } from "./adapters/out/supabase-document-file-storage.adapter.js";
import { SupabaseDocumentAuditLogAdapter } from "./adapters/out/supabase-document-audit-log.adapter.js";
import { ListDocumentCategoriesUseCase } from "./application/use-cases/list-document-categories.use-case.js";
import { CreateDocumentCategoryUseCase } from "./application/use-cases/create-document-category.use-case.js";
import { UpdateDocumentCategoryUseCase } from "./application/use-cases/update-document-category.use-case.js";
import { SetDocumentCategoryActiveUseCase } from "./application/use-cases/set-document-category-active.use-case.js";
import {
  GetCompanyDocumentDownloadUrlUseCase,
  GetCompanyDocumentHistoryUseCase,
  ListCompanyDocumentsUseCase,
  RemoveCompanyDocumentUseCase,
  ReplaceCompanyDocumentUseCase,
  UploadCompanyDocumentUseCase,
} from "./application/use-cases/company-documents.use-cases.js";
import { DocumentCategoriesController } from "./adapters/in/document-categories.controller.js";
import { CompanyDocumentsController } from "./adapters/in/company-documents.controller.js";
import type { ListCompanyDocumentsPort } from "./domain/ports/in/company-document.ports.js";
import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../utils/lisbonDayInstants.js";
import { SupabaseEmployeeDirectoryAdapter } from "./adapters/out/supabase-employee-directory.adapter.js";
import { SupabaseEmployeeFileStorageAdapter } from "./adapters/out/supabase-employee-file-storage.adapter.js";
import { PdfParseTextExtractorAdapter } from "./adapters/out/pdf-parse-text-extractor.adapter.js";
import { ListEmployeeDocumentsUseCase } from "./application/use-cases/list-employee-documents.use-case.js";
import { UploadEmployeeDocumentUseCase } from "./application/use-cases/upload-employee-document.use-case.js";
import { ReplaceEmployeeDocumentUseCase } from "./application/use-cases/replace-employee-document.use-case.js";
import { RemoveEmployeeDocumentUseCase } from "./application/use-cases/remove-employee-document.use-case.js";
import { GetEmployeeDocumentDownloadUrlUseCase } from "./application/use-cases/get-employee-document-download-url.use-case.js";
import { GetEmployeeDocumentHistoryUseCase } from "./application/use-cases/get-employee-document-history.use-case.js";
import { GetDocumentOverviewUseCase } from "./application/use-cases/get-document-overview.use-case.js";
import { GetDocumentArchiveUseCase } from "./application/use-cases/get-document-archive.use-case.js";
import { GetEmployeeDocumentSummaryUseCase } from "./application/use-cases/get-employee-document-summary.use-case.js";
import { ListPendingDocumentsUseCase, ReplaceMyDocumentUseCase, ReviewEmployeeDocumentUseCase } from "./application/use-cases/employee-document-review.use-cases.js";
import { ImportPayslipsUseCase, PreviewPayslipImportUseCase } from "./application/use-cases/payslip-import.use-cases.js";
import { GetMyDocumentUrlUseCase, ListMyDocumentsUseCase } from "./application/use-cases/my-documents.use-cases.js";
import { EmployeeDocumentsController } from "./adapters/in/employee-documents.controller.js";
import { PayslipsController } from "./adapters/in/payslips.controller.js";
import { MyDocumentsController } from "./adapters/in/my-documents.controller.js";
import type { ListPendingDocumentsPort } from "./domain/ports/in/employee-document.ports.js";

/**
 * Composition root do módulo `documents` (Base Organizacional, ticket 03) —
 * motor único de documentos da Empresa e do Colaborador. Expõe as
 * categorias (`/hr/document-categories` e `/document-categories`) e os
 * documentos da Empresa (`/company-documents`) e, desde a fase 1 da ADR-0040,
 * os documentos de colaborador (`/novo-rh/people/:id/documents*`, visão geral,
 * importação de recibos; aliases `/hr/*` até à fase 4) e os do Portal
 * (`meRouter`, `/me/documents*` — montado com as outras rotas `/me`).
 */
export function createDocumentsModule(): {
  router: Router;
  meRouter: Router;
  listCompanyDocuments: ListCompanyDocumentsPort;
  listPendingDocuments: ListPendingDocumentsPort;
} {
  const documentRepository = new SupabaseDocumentRepository(createScopedQuery);
  const categoryRepository = new SupabaseDocumentCategoryRepository(createScopedQuery);
  const storage = new SupabaseDocumentFileStorageAdapter();
  const auditLog = new SupabaseDocumentAuditLogAdapter(createScopedQuery);

  const categoriesController = new DocumentCategoriesController(
    new ListDocumentCategoriesUseCase(categoryRepository),
    new CreateDocumentCategoryUseCase(categoryRepository),
    new UpdateDocumentCategoryUseCase(categoryRepository),
    new SetDocumentCategoryActiveUseCase(categoryRepository),
  );
  const listCompanyDocuments = new ListCompanyDocumentsUseCase(documentRepository, categoryRepository);
  const companyDocumentsController = new CompanyDocumentsController(
    listCompanyDocuments,
    new UploadCompanyDocumentUseCase(documentRepository, categoryRepository, storage, auditLog),
    new ReplaceCompanyDocumentUseCase(documentRepository, categoryRepository, storage, auditLog),
    new RemoveCompanyDocumentUseCase(documentRepository, auditLog),
    new GetCompanyDocumentDownloadUrlUseCase(documentRepository, storage),
    new GetCompanyDocumentHistoryUseCase(documentRepository, categoryRepository),
  );

  // Documentos de colaborador (ADR-0040, fase 1 — vindos do RH antigo).
  const employees = new SupabaseEmployeeDirectoryAdapter(createScopedQuery);
  const employeeFiles = new SupabaseEmployeeFileStorageAdapter();
  /** "Hoje" no calendário do negócio (Lisboa). */
  const lisbonToday = () => DateTime.now().setZone(REPORT_TIMEZONE).toISODate()!;
  const uploadEmployeeDocument = new UploadEmployeeDocumentUseCase(employees, documentRepository, employeeFiles, auditLog, categoryRepository);
  const replaceEmployeeDocument = new ReplaceEmployeeDocumentUseCase(employees, documentRepository, employeeFiles, auditLog);
  const getEmployeeDocumentDownloadUrl = new GetEmployeeDocumentDownloadUrlUseCase(documentRepository, employeeFiles);
  const employeeDocumentsController = new EmployeeDocumentsController(
    new ListEmployeeDocumentsUseCase(documentRepository),
    uploadEmployeeDocument,
    replaceEmployeeDocument,
    new RemoveEmployeeDocumentUseCase(documentRepository, auditLog),
    getEmployeeDocumentDownloadUrl,
    new GetEmployeeDocumentHistoryUseCase(documentRepository),
    new GetDocumentOverviewUseCase(employees, documentRepository, categoryRepository),
    new ReviewEmployeeDocumentUseCase(documentRepository, auditLog),
    new GetEmployeeDocumentSummaryUseCase(employees, documentRepository, categoryRepository),
    new GetDocumentArchiveUseCase(employees, documentRepository, categoryRepository),
  );
  const payslipsController = new PayslipsController(
    new PreviewPayslipImportUseCase(employees, documentRepository, categoryRepository, new PdfParseTextExtractorAdapter()),
    new ImportPayslipsUseCase(documentRepository, categoryRepository, uploadEmployeeDocument, replaceEmployeeDocument),
  );
  const myDocumentsController = new MyDocumentsController(
    new ListMyDocumentsUseCase(employees, documentRepository, categoryRepository, lisbonToday),
    new GetMyDocumentUrlUseCase(employees, getEmployeeDocumentDownloadUrl),
    new ReplaceMyDocumentUseCase(employees, documentRepository, categoryRepository, employeeFiles, auditLog, lisbonToday),
  );

  const router = createRouter();
  router.use(categoriesController.router);
  router.use(companyDocumentsController.router);
  router.use(employeeDocumentsController.router);
  router.use(payslipsController.router);
  // `listCompanyDocuments` é usado pelo `calendar` (prazos de validade, ticket 05);
  // `listPendingDocuments` pela caixa de pedidos do RH antigo (`/hr/requests`).
  return {
    router,
    meRouter: myDocumentsController.router,
    listCompanyDocuments,
    listPendingDocuments: new ListPendingDocumentsUseCase(documentRepository, employees, categoryRepository),
  };
}
