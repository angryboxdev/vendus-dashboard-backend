import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/scoped-db/supabase-client.js";
import { CrmWorkspaceController } from "./adapters/in/crm-workspace.controller.js";
import { SupabaseCrmWorkspaceRepository } from "./adapters/out/supabase-crm-workspace.repository.js";
import { CrmWorkspaceService } from "./application/crm-workspace.service.js";

export function createCrmModule(): { router: Router } {
  const db = getSupabaseServiceRole();
  if (!db) throw new Error("Supabase service role não configurado");
  const repository = new SupabaseCrmWorkspaceRepository(db);
  const service = new CrmWorkspaceService(repository);
  return { router: new CrmWorkspaceController(service).router };
}
