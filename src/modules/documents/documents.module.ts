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

/**
 * Composition root do módulo `documents` (Base Organizacional, ticket 03) —
 * motor único de documentos da Empresa e do Colaborador. Expõe as
 * categorias (`/hr/document-categories` e `/document-categories`) e os
 * documentos da Empresa (`/company-documents`). Os documentos de colaborador
 * continuam expostos pelo módulo `hr` (`/hr/people/:id/documents`), que usa
 * os ports e adapters deste módulo.
 */
export function createDocumentsModule(): { router: Router } {
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
  const companyDocumentsController = new CompanyDocumentsController(
    new ListCompanyDocumentsUseCase(documentRepository, categoryRepository),
    new UploadCompanyDocumentUseCase(documentRepository, categoryRepository, storage, auditLog),
    new ReplaceCompanyDocumentUseCase(documentRepository, categoryRepository, storage, auditLog),
    new RemoveCompanyDocumentUseCase(documentRepository, auditLog),
    new GetCompanyDocumentDownloadUrlUseCase(documentRepository, storage),
    new GetCompanyDocumentHistoryUseCase(documentRepository, categoryRepository),
  );

  const router = createRouter();
  router.use(categoriesController.router);
  router.use(companyDocumentsController.router);
  return { router };
}
