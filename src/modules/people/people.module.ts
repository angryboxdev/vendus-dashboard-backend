import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { PeopleController } from "./adapters/in/people.controller.js";
import { SupabasePeoplePhotoAdapter } from "./adapters/out/supabase-people-photo.adapter.js";
import { SupabasePeopleRepository } from "./adapters/out/supabase-people.repository.js";
import { EmploymentUseCases } from "./application/use-cases/employment.use-cases.js";
import { PeopleUseCases } from "./application/use-cases/people.use-cases.js";
import type { Viewer } from "./domain/ports/in/people.ports.js";
import type { PeopleAccountPort, PeopleAuditPort, PeopleClockPort } from "./domain/ports/out/people.ports.js";

/**
 * Composition root do Novo RH → Pessoas (Fase 2). Privacidade, âmbitos,
 * contas e auditoria vêm de outros módulos pelo server.ts.
 */
export function createPeopleModule(deps: {
  audit: PeopleAuditPort;
  accounts: PeopleAccountPort;
  clock: PeopleClockPort;
  viewerOf: (req: Request) => Promise<Viewer>;
}): { router: Router; people: PeopleUseCases; employment: EmploymentUseCases } {
  const repo = new SupabasePeopleRepository(createScopedQuery);
  const people = new PeopleUseCases(repo, deps.accounts, deps.audit, deps.clock, new SupabasePeoplePhotoAdapter());
  const employment = new EmploymentUseCases(repo, deps.audit, deps.clock);
  const controller = new PeopleController(people, employment, new SupabaseIdempotencyStore(createScopedQuery), deps.viewerOf);
  return { router: controller.router, people, employment };
}
