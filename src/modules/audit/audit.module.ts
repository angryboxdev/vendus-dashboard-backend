import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { AuditController } from "./adapters/in/audit.controller.js";
import { HttpAuditContext, SupabaseAuditStore } from "./adapters/out/supabase-audit-store.js";
import { AuditUseCases } from "./application/use-cases/audit.use-cases.js";
import type { AuditQueryPorts, RecordAuditEventPort } from "./domain/ports/in/audit.ports.js";

/**
 * Composition root da auditoria transversal (Novo RH, Fase 1 ticket 03).
 * `recorder` é entregue aos outros módulos do Novo RH pelo server.ts;
 * `queries` serve o relatório de histórico de alterações (Fase 9).
 */
export function createAuditModule(): { router: Router; recorder: RecordAuditEventPort; queries: AuditQueryPorts } {
  const useCases = new AuditUseCases(new SupabaseAuditStore(createScopedQuery), new HttpAuditContext());
  return { router: new AuditController(useCases).router, recorder: useCases, queries: useCases };
}
