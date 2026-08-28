import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { CrmWorkspaceController } from "./adapters/in/crm-workspace.controller.js";
import { SupabaseCrmWorkspaceRepository } from "./adapters/out/supabase-crm-workspace.repository.js";
import { CrmWorkspaceService } from "./application/crm-workspace.service.js";

/**
 * Composition root do módulo crm (spec B2 ticket 07).
 *
 * Segue D2: o adapter não constrói o seu próprio `ScopedQuery`, recebe o
 * factory `createScopedQuery` injectado aqui e constrói um helper escopado
 * por chamada.
 */
export function createCrmModule(): { router: Router } {
  const repository = new SupabaseCrmWorkspaceRepository(createScopedQuery);
  const service = new CrmWorkspaceService(repository);
  return { router: new CrmWorkspaceController(service).router };
}
