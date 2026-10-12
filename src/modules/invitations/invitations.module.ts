import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createInvitationsRouters } from "./adapters/in/invitations.controller.js";
import { CryptoInvitationCodes, SupabaseInvitationLookup, SupabaseInvitationsRepository } from "./adapters/out/supabase-invitations.adapters.js";
import { InvitationsUseCases } from "./application/use-cases/invitations.use-cases.js";
import type { InvitationsContextPort } from "./domain/ports/out/invitations.ports.js";

/** Composition root do Novo RH → Convites e adesões (FE-054). `publicRouter` monta-se antes da autenticação. */
export function createInvitationsModule(deps: { context: InvitationsContextPort }): { router: Router; publicRouter: Router; invitations: InvitationsUseCases } {
  const invitations = new InvitationsUseCases(new SupabaseInvitationsRepository(createScopedQuery), new CryptoInvitationCodes(), new SupabaseInvitationLookup(), deps.context);
  return { ...createInvitationsRouters(invitations, new SupabaseIdempotencyStore(createScopedQuery)), invitations };
}
