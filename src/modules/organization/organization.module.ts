import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseOrganizationProfileRepository } from "./adapters/out/supabase-organization-profile.repository.js";
import { SupabaseOrganizationFileStorageAdapter } from "./adapters/out/supabase-organization-file-storage.adapter.js";
import { SupabaseOrganizationAuditLogAdapter } from "./adapters/out/supabase-organization-audit-log.adapter.js";
import { GetOrganizationProfileUseCase } from "./application/use-cases/get-organization-profile.use-case.js";
import { UpdateOrganizationProfileUseCase } from "./application/use-cases/update-organization-profile.use-case.js";
import { UploadOrganizationLogoUseCase } from "./application/use-cases/upload-organization-logo.use-case.js";
import { ListOrganizationHistoryUseCase } from "./application/use-cases/list-organization-history.use-case.js";
import { OrganizationController } from "./adapters/in/organization.controller.js";

/**
 * Composition root do módulo organization (Base Organizacional, ticket 01).
 * Único sítio que conhece os adapters concretos.
 */
export function createOrganizationModule(): { router: Router } {
  const repository = new SupabaseOrganizationProfileRepository(createScopedQuery);
  const storage = new SupabaseOrganizationFileStorageAdapter();
  const auditLog = new SupabaseOrganizationAuditLogAdapter(createScopedQuery);

  const controller = new OrganizationController(
    new GetOrganizationProfileUseCase(repository, storage),
    new UpdateOrganizationProfileUseCase(repository, storage, auditLog),
    new UploadOrganizationLogoUseCase(repository, storage, auditLog),
    new ListOrganizationHistoryUseCase(auditLog),
  );

  return { router: controller.router };
}
