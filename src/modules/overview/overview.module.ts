import type { Request, Router } from "express";
import { createOverviewRouter } from "./adapters/in/overview.controller.js";
import { OverviewUseCases, type OverviewViewer } from "./application/use-cases/overview.use-cases.js";
import type { OverviewSourcesPort } from "./domain/ports/out/overview.ports.js";

/** Composition root do Novo RH → Painel. Só leitura: as fontes são os outros módulos (server.ts). */
export function createOverviewModule(deps: { sources: OverviewSourcesPort; viewerOf: (req: Request) => OverviewViewer }): { router: Router; overview: OverviewUseCases } {
  const overview = new OverviewUseCases(deps.sources);
  return { router: createOverviewRouter(overview, deps.viewerOf), overview };
}
