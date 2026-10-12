import type { Router } from "express";
import { createReportsRouter, type ReportsAccess } from "./adapters/in/reports.controller.js";
import { ReportsUseCases } from "./application/use-cases/reports.use-cases.js";
import type { ReportSourcesPort } from "./domain/ports/out/reports.ports.js";

/** Composition root do Novo RH → Relatórios (Fase 9). As linhas vêm dos módulos donos dos dados. */
export function createReportsModule(deps: { sources: ReportSourcesPort; access: ReportsAccess }): { router: Router; reports: ReportsUseCases } {
  const reports = new ReportsUseCases(deps.sources);
  return { router: createReportsRouter(reports, deps.access), reports };
}
