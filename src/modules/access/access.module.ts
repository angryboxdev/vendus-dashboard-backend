import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseAccessRepository } from "./adapters/out/supabase-access.repository.js";
import { ResolveAccessUseCase } from "./application/use-cases/resolve-access.use-case.js";
import { createAccessGuards, type AccessGuards } from "./adapters/in/access-guards.js";
import { createAccessMeRouter } from "./adapters/in/access-me.controller.js";
import type { ResolveAccessPort } from "./domain/ports/in/resolve-access.port.js";
import { AccessAdminUseCases } from "./application/use-cases/access-admin.use-cases.js";
import { createAccessAdminRouter } from "./adapters/in/access-admin.controller.js";
import {
  SupabaseAccessAdminRepository,
  SupabaseAccessAudit,
  SupabaseAccountDirectory,
  SupabaseEmployeeLinkAdapter,
} from "./adapters/out/supabase-access-admin.adapters.js";

export interface AccessModule {
  resolveAccess: ResolveAccessPort;
  guards: AccessGuards;
  /** `/me/access` — montar a seguir a `loadAccess`. */
  meRouter: Router;
  /** Utilizadores & Perfis (`/users`, `/access-profiles`) — só Admin pela tabela central de rotas. */
  adminRouter: Router;
}

/** Composition root do motor de autorização (Utilizadores & Perfis de Acesso 2.0). */
export function createAccessModule(): AccessModule {
  const resolveAccess = new ResolveAccessUseCase(new SupabaseAccessRepository(createScopedQuery));
  const admin = new AccessAdminUseCases(
    new SupabaseAccessAdminRepository(createScopedQuery),
    new SupabaseEmployeeLinkAdapter(createScopedQuery),
    new SupabaseAccountDirectory(),
    new SupabaseAccessAudit(createScopedQuery),
    resolveAccess,
  );
  return {
    resolveAccess,
    guards: createAccessGuards(resolveAccess),
    meRouter: createAccessMeRouter(),
    adminRouter: createAccessAdminRouter(admin),
  };
}
