import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { OrgStructureController } from "./adapters/in/org-structure.controller.js";
import { HttpRequestIp, SupabaseOrgStructureRepository } from "./adapters/out/supabase-org-structure.repository.js";
import { OrgStructureUseCases } from "./application/use-cases/org-structure.use-cases.js";
import type { OrgStructurePorts } from "./domain/ports/in/org-structure.ports.js";
import type { OrgStructureAuditPort } from "./domain/ports/out/org-structure.ports.js";

/** Composition root da estrutura organizacional (Novo RH, Fase 1 ticket 04). */
export function createOrgStructureModule(deps: { audit: OrgStructureAuditPort }): { router: Router; structure: OrgStructurePorts } {
  const structure = new OrgStructureUseCases(new SupabaseOrgStructureRepository(createScopedQuery), deps.audit, new HttpRequestIp());
  const controller = new OrgStructureController(structure, new SupabaseIdempotencyStore(createScopedQuery), (req) => req.auth!.email || req.auth!.sub);
  return { router: controller.router, structure };
}
