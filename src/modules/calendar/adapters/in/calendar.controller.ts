import { Router, type Response } from "express";
import { requireMinRole, type AppRole } from "../../../../middleware/auth.js";
import {
  EVENT_CATEGORIES,
  type CompanyEventDetails,
  type EventCategory,
  type EventPriority,
  type EventVisibility,
} from "../../domain/entities/company-event.js";
import type { HolidayDetails, HolidayType } from "../../domain/entities/holiday.js";
import {
  CompanyEventNotFoundError,
  DuplicateHolidayError,
  HolidayNotFoundError,
  InvalidCalendarEntryError,
  InvalidCalendarLocationError,
} from "../../domain/errors.js";
import type {
  CancelCompanyEventPort,
  CreateCompanyEventPort,
  CreateHolidayPort,
  DeleteHolidayPort,
  ImportHolidaysPort,
  ListCalendarPort,
  ListUpcomingImportantPort,
  PreviewHolidayImportPort,
  UpdateCompanyEventPort,
  UpdateHolidayPort,
} from "../../domain/ports/in/calendar.ports.js";
import type { CalendarItemKind, CalendarViewerRole } from "../../domain/services/calendar-items.service.js";

const KINDS = new Set<CalendarItemKind>(["holiday", "event", "deadline"]);
const PRIORITIES = new Set<EventPriority>(["normal", "important", "critical"]);
const HOLIDAY_TYPES = new Set<HolidayType>(["national", "municipal", "custom"]);

/** `AppRole` e `CalendarViewerRole` têm os mesmos valores — só o domínio não pode importar o tipo do middleware. */
function toViewerRole(role: AppRole): CalendarViewerRole {
  // `employee` nunca chega aqui (`restrictEmployeeToPortal`); se chegasse, recusa — nunca promove a hr_viewer.
  if (role === "employee") throw new Error("Sem permissão para esta operação");
  return role;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableStr(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

/** Só copia campos conhecidos com o tipo certo; valores inválidos ficam para a validação do domínio. */
function readHolidayChanges(body: Record<string, unknown>): Partial<HolidayDetails> {
  const out: Partial<HolidayDetails> = {};
  if (str(body.date) !== undefined) out.date = body.date as string;
  if (str(body.name) !== undefined) out.name = body.name as string;
  if (typeof body.type === "string" && HOLIDAY_TYPES.has(body.type as HolidayType)) out.type = body.type as HolidayType;
  if (nullableStr(body.locationId) !== undefined) out.locationId = (body.locationId as string | null) || null;
  return out;
}

function readEventChanges(body: Record<string, unknown>): Partial<CompanyEventDetails> {
  const out: Partial<CompanyEventDetails> = {};
  if (str(body.title) !== undefined) out.title = body.title as string;
  if (str(body.date) !== undefined) out.date = body.date as string;
  if (typeof body.allDay === "boolean") out.allDay = body.allDay;
  if (nullableStr(body.startTime) !== undefined) out.startTime = body.startTime as string | null;
  if (nullableStr(body.endTime) !== undefined) out.endTime = body.endTime as string | null;
  if (nullableStr(body.description) !== undefined) out.description = body.description as string | null;
  if (typeof body.category === "string") out.category = body.category as EventCategory;
  if (nullableStr(body.locationId) !== undefined) out.locationId = (body.locationId as string | null) || null;
  if (typeof body.priority === "string") out.priority = body.priority as EventPriority;
  if (nullableStr(body.responsible) !== undefined) out.responsible = body.responsible as string | null;
  if (typeof body.visibility === "string") out.visibility = body.visibility as EventVisibility;
  return out;
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidCalendarEntryError || e instanceof InvalidCalendarLocationError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof DuplicateHolidayError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (e instanceof HolidayNotFoundError || e instanceof CompanyEventNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/**
 * Empresa & Estrutura → Calendário & Eventos (Base Organizacional, tickets
 * 04/05). Leitura para qualquer role autenticado (com visibilidade aplicada);
 * feriados só `admin` (afetam as Escalas); eventos `manager`+.
 */
export class CalendarController {
  readonly router: Router;

  constructor(
    private readonly listCalendar: ListCalendarPort,
    private readonly listUpcomingImportant: ListUpcomingImportantPort,
    private readonly createHoliday: CreateHolidayPort,
    private readonly updateHoliday: UpdateHolidayPort,
    private readonly deleteHoliday: DeleteHolidayPort,
    private readonly previewHolidayImport: PreviewHolidayImportPort,
    private readonly importHolidays: ImportHolidaysPort,
    private readonly createCompanyEvent: CreateCompanyEventPort,
    private readonly updateCompanyEvent: UpdateCompanyEventPort,
    private readonly cancelCompanyEvent: CancelCompanyEventPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /calendar?from&to&kinds=holiday,event,deadline&locationId&priority */
    this.router.get("/calendar", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        if (!q.from || !q.to) {
          res.status(400).json({ error: "from e to são obrigatórios (AAAA-MM-DD)" });
          return;
        }
        const kinds = (q.kinds ?? "").split(",").filter((k): k is CalendarItemKind => KINDS.has(k as CalendarItemKind));
        res.json(
          await this.listCalendar.execute({
            organizationId: req.auth!.orgId,
            viewerRole: toViewerRole(req.auth!.orgRole),
            from: q.from,
            to: q.to,
            filter: {
              ...(kinds.length > 0 && { kinds }),
              ...(q.locationId && { locationId: q.locationId }),
              ...(q.priority && PRIORITIES.has(q.priority as EventPriority) && { priority: q.priority as EventPriority }),
            },
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** GET /calendar/upcoming — "Próximos eventos importantes" (60 dias). */
    this.router.get("/calendar/upcoming", async (req, res) => {
      try {
        res.json(
          await this.listUpcomingImportant.execute({
            organizationId: req.auth!.orgId,
            viewerRole: toViewerRole(req.auth!.orgRole),
            today: todayIso(),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/calendar/holidays", requireMinRole("admin"), async (req, res) => {
      try {
        const c = readHolidayChanges((req.body ?? {}) as Record<string, unknown>);
        const created = await this.createHoliday.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          details: { date: c.date ?? "", name: c.name ?? "", type: c.type ?? "custom", locationId: c.locationId ?? null },
        });
        res.status(201).json(created);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.patch("/calendar/holidays/:id", requireMinRole("admin"), async (req, res) => {
      try {
        res.json(
          await this.updateHoliday.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
            changes: readHolidayChanges((req.body ?? {}) as Record<string, unknown>),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.delete("/calendar/holidays/:id", requireMinRole("admin"), async (req, res) => {
      try {
        await this.deleteHoliday.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, id: req.params["id"] as string });
        res.status(204).send();
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /calendar/holidays/import/preview — body `{ country: "PT", year }`. */
    this.router.post("/calendar/holidays/import/preview", requireMinRole("admin"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (body.country !== "PT") {
          res.status(400).json({ error: "Só Portugal (PT) tem importação automática nesta fase" });
          return;
        }
        res.json(await this.previewHolidayImport.execute({ organizationId: req.auth!.orgId, country: "PT", year: Number(body.year) }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /calendar/holidays/import — grava só os que faltam (idempotente). */
    this.router.post("/calendar/holidays/import", requireMinRole("admin"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (body.country !== "PT") {
          res.status(400).json({ error: "Só Portugal (PT) tem importação automática nesta fase" });
          return;
        }
        res.json(
          await this.importHolidays.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, country: "PT", year: Number(body.year) }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/calendar/events", requireMinRole("manager"), async (req, res) => {
      try {
        const c = readEventChanges((req.body ?? {}) as Record<string, unknown>);
        const created = await this.createCompanyEvent.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          details: {
            title: c.title ?? "",
            date: c.date ?? "",
            allDay: c.allDay ?? true,
            startTime: c.startTime ?? null,
            endTime: c.endTime ?? null,
            description: c.description ?? null,
            category: c.category ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1]!,
            locationId: c.locationId ?? null,
            priority: c.priority ?? "normal",
            responsible: c.responsible ?? null,
            visibility: c.visibility ?? "all",
          },
        });
        res.status(201).json(created);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.patch("/calendar/events/:id", requireMinRole("manager"), async (req, res) => {
      try {
        res.json(
          await this.updateCompanyEvent.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
            changes: readEventChanges((req.body ?? {}) as Record<string, unknown>),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /calendar/events/:id/cancel — nunca há DELETE de um evento. */
    this.router.patch("/calendar/events/:id/cancel", requireMinRole("manager"), async (req, res) => {
      try {
        res.json(await this.cancelCompanyEvent.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, id: req.params["id"] as string }));
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
