import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createWorkspaceRouter } from "./adapters/in/workspace.controller.js";
import { SupabaseWorkspaceRepository } from "./adapters/out/supabase-workspace.repository.js";
import { WorkspaceUseCases } from "./application/use-cases/workspace.use-cases.js";
import type { WorkspaceContextPort } from "./domain/ports/out/workspace.ports.js";

/** Composition root do Novo RH → Espaço de trabalho (Fase 9): tarefas, solicitações, quem está. */
export function createWorkspaceModule(deps: { context: WorkspaceContextPort }): { router: Router; workspace: WorkspaceUseCases } {
  const workspace = new WorkspaceUseCases(new SupabaseWorkspaceRepository(createScopedQuery), deps.context);
  return { router: createWorkspaceRouter(workspace, new SupabaseIdempotencyStore(createScopedQuery)), workspace };
}
