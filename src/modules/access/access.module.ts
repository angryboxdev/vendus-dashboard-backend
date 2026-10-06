import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseAccessRepository } from "./adapters/out/supabase-access.repository.js";
import { ResolveAccessUseCase } from "./application/use-cases/resolve-access.use-case.js";
import { createAccessGuards, type AccessGuards } from "./adapters/in/access-guards.js";
import { createAccessMeRouter } from "./adapters/in/access-me.controller.js";
import type { ResolveAccessPort } from "./domain/ports/in/resolve-access.port.js";

export interface AccessModule {
  resolveAccess: ResolveAccessPort;
  guards: AccessGuards;
  /** `/me/access` — montar a seguir a `loadAccess`. */
  meRouter: Router;
}

/** Composition root do motor de autorização (Utilizadores & Perfis de Acesso 2.0). */
export function createAccessModule(): AccessModule {
  const resolveAccess = new ResolveAccessUseCase(new SupabaseAccessRepository(createScopedQuery));
  return { resolveAccess, guards: createAccessGuards(resolveAccess), meRouter: createAccessMeRouter() };
}
