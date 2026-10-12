import type { RequestHandler, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { demoContext } from "./adapters/in/demo-context.middleware.js";
import { createDemoOrgRouter } from "./adapters/in/demo-org.controller.js";
import { JsonFileDemoDatasetSink } from "./adapters/out/json-file-demo-dataset.sink.js";
import { SupabaseDemoOrgRepository, SupabaseDemoSeeder } from "./adapters/out/supabase-demo-org.adapters.js";
import { DemoOrgUseCases } from "./application/use-cases/demo-org.use-cases.js";
import { GenerateDemoDatasetUseCase } from "./application/use-cases/generate-demo-dataset.use-case.js";
import type { GenerateDemoDatasetPort } from "./domain/ports/in/generate-demo-dataset.port.js";
import type { DemoOrgSupportPort } from "./domain/ports/out/demo-org.ports.js";

/** Composition root do gerador para ficheiro JSON (CLI, Fase 0). */
export function createDemoDataModule(options: { outputFile: string }): { generate: GenerateDemoDatasetPort } {
  const sink = new JsonFileDemoDatasetSink(options.outputFile);
  return { generate: new GenerateDemoDatasetUseCase(sink) };
}

/**
 * Composition root da organização de demonstração do Novo RH (ADR-0034):
 * rota de estado/criação e o middleware que troca a organização do pedido.
 */
export function createDemoOrgModule(deps: {
  support: DemoOrgSupportPort;
  ptHolidays: (year: number) => { date: string; name: string }[];
}): { router: Router; demoContext: RequestHandler; demo: DemoOrgUseCases } {
  const demo = new DemoOrgUseCases(new SupabaseDemoOrgRepository(), new SupabaseDemoSeeder(createScopedQuery, deps.ptHolidays), deps.support);
  return {
    router: createDemoOrgRouter(demo, new SupabaseIdempotencyStore(createScopedQuery)),
    demoContext: demoContext((org) => demo.resolve(org)),
    demo,
  };
}
