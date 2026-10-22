import type { Router } from "express";
import { createReportsRouter, type ReportsAccess } from "./adapters/in/reports.controller.js";
import { XlsxTableWriterAdapter } from "./adapters/out/xlsx-table-writer.adapter.js";
import { AttendanceDaysUseCases } from "./application/use-cases/attendance-days.use-cases.js";
import { ReportsUseCases } from "./application/use-cases/reports.use-cases.js";
import type { AttendanceDaysSourcesPort } from "./domain/ports/out/attendance-days.ports.js";
import type { ReportSourcesPort } from "./domain/ports/out/reports.ports.js";

/**
 * Composition root do Novo RH → Relatórios (Fase 9). As linhas vêm dos módulos
 * donos dos dados; a assiduidade por blocos usa o motor de ponto em lote.
 */
export function createReportsModule(deps: { sources: ReportSourcesPort; attendanceDays: AttendanceDaysSourcesPort; access: ReportsAccess }): {
  router: Router;
  reports: ReportsUseCases;
} {
  const reports = new ReportsUseCases(deps.sources);
  const attendanceDays = new AttendanceDaysUseCases(deps.attendanceDays, new XlsxTableWriterAdapter());
  return { router: createReportsRouter(reports, deps.access, attendanceDays), reports };
}
