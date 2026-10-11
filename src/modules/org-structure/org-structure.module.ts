import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { OrgStructureController } from "./adapters/in/org-structure.controller.js";
import { HttpRequestIp, SupabaseOrgStructureRepository } from "./adapters/out/supabase-org-structure.repository.js";
import { OrgStructureUseCases } from "./application/use-cases/org-structure.use-cases.js";
import type { OrgStructurePorts } from "./domain/ports/in/org-structure.ports.js";
import type { OrgStructureAuditPort } from "./domain/ports/out/org-structure.ports.js";

/** Composition root da estrutura organizacional (Novo RH, Fase 1 ticket 04). */
export function createOrgStructureModule(deps: { audit: OrgStructureAuditPort }): {
  router: Router;
  structure: OrgStructurePorts;
  /** Liga a verificação de âmbito depois de o módulo access existir (ele depende desta estrutura). */
  setScopeCheck(check: (req: Request, employeeId: string, date: string) => Promise<boolean>): void;
} {
  const structure = new OrgStructureUseCases(new SupabaseOrgStructureRepository(createScopedQuery), deps.audit, new HttpRequestIp());
  let scopeCheck: (req: Request, employeeId: string, date: string) => Promise<boolean> = async () => false;
  const controller = new OrgStructureController(
    structure,
    new SupabaseIdempotencyStore(createScopedQuery),
    (req) => req.auth!.email || req.auth!.sub,
    (req, employeeId, date) => scopeCheck(req, employeeId, date),
  );
  return {
    router: controller.router,
    structure,
    setScopeCheck: (check) => {
      scopeCheck = check;
    },
  };
}
