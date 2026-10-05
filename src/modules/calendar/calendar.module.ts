import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { ListLocationsPort } from "../locations/domain/ports/in/list-locations.port.js";
import type { ListCompanyDocumentsPort } from "../documents/domain/ports/in/company-document.ports.js";
import {
  SupabaseCalendarAuditLogAdapter,
  SupabaseCompanyEventRepository,
  SupabaseHolidayRepository,
} from "./adapters/out/supabase-calendar.repositories.js";
import { CompanyDocumentDeadlineReadAdapter, LocationsCalendarReadAdapter } from "./adapters/out/cross-module-read.adapters.js";
import {
  CancelCompanyEventUseCase,
  CreateCompanyEventUseCase,
  CreateHolidayUseCase,
  DeleteHolidayUseCase,
  ImportHolidaysUseCase,
  ListCalendarUseCase,
  ListUpcomingImportantUseCase,
  PreviewHolidayImportUseCase,
  UpdateCompanyEventUseCase,
  UpdateHolidayUseCase,
} from "./application/use-cases/calendar.use-cases.js";
import { CalendarController } from "./adapters/in/calendar.controller.js";

/**
 * Composition root do módulo `calendar` (Base Organizacional, tickets 04/05).
 * Recebe os input ports de `locations` e `documents` (D10 — mesmo padrão de
 * `stock-planning`), nunca os seus adapters.
 */
export function createCalendarModule(listLocations: ListLocationsPort, listCompanyDocuments: ListCompanyDocumentsPort): { router: Router } {
  const holidays = new SupabaseHolidayRepository(createScopedQuery);
  const events = new SupabaseCompanyEventRepository(createScopedQuery);
  const auditLog = new SupabaseCalendarAuditLogAdapter(createScopedQuery);
  const locations = new LocationsCalendarReadAdapter(listLocations);
  const deadlines = new CompanyDocumentDeadlineReadAdapter(listCompanyDocuments);

  const controller = new CalendarController(
    new ListCalendarUseCase(holidays, events, deadlines),
    new ListUpcomingImportantUseCase(holidays, events, deadlines),
    new CreateHolidayUseCase(holidays, locations, auditLog),
    new UpdateHolidayUseCase(holidays, locations, auditLog),
    new DeleteHolidayUseCase(holidays, auditLog),
    new PreviewHolidayImportUseCase(holidays),
    new ImportHolidaysUseCase(holidays, auditLog),
    new CreateCompanyEventUseCase(events, locations, auditLog),
    new UpdateCompanyEventUseCase(events, locations, auditLog),
    new CancelCompanyEventUseCase(events, auditLog),
  );
  return { router: controller.router };
}
