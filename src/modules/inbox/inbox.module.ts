import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createInboxRouter } from "./adapters/in/inbox.controller.js";
import { InboxUseCases, type InboxViewer } from "./application/use-cases/inbox.use-cases.js";
import type { InboxDirectoryPort, InboxSourcePort } from "./domain/ports/out/inbox.ports.js";

/** Composition root do Novo RH → Caixa de pedidos. As fontes são os módulos donos de cada tipo (server.ts). */
export function createInboxModule(deps: { sources: InboxSourcePort[]; directory: InboxDirectoryPort; viewerOf: (req: Request) => InboxViewer }): { router: Router; inbox: InboxUseCases } {
  const inbox = new InboxUseCases(deps.sources, deps.directory);
  return { router: createInboxRouter(inbox, new SupabaseIdempotencyStore(createScopedQuery), deps.viewerOf), inbox };
}
