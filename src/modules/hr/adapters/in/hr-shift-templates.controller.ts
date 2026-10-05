import { Router, type Response } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import {
  DuplicateShiftTemplateNameError,
  InvalidShiftTemplateError,
  InvalidTemplateApplicationError,
  ShiftTemplateNotFoundError,
} from "../../domain/errors.js";
import type {
  ApplicationAudience,
  ApplicationDays,
  OccurrenceDecision,
} from "../../domain/services/template-application.service.js";
import type {
  ApplyTemplatePort,
  PreviewTemplateApplicationPort,
  TemplateApplicationConfig,
  CreateShiftTemplatePort,
  ListShiftTemplatesPort,
  SetShiftTemplateActivePort,
  ShiftTemplateInput,
  UpdateShiftTemplatePort,
} from "../../domain/ports/in/shift-template.ports.js";

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidShiftTemplateError || e instanceof InvalidTemplateApplicationError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof DuplicateShiftTemplateNameError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (e instanceof ShiftTemplateNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

const nullableString = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v : null);

/**
 * Lê os campos enviados — só inclui uma chave quando o body a trouxe (o
 * PATCH não sobrescreve o que não veio). Tipos errados ficam de fora e a
 * validação de negócio (horários, nome) é do domínio.
 */
function readInput(body: Record<string, unknown>): Partial<ShiftTemplateInput> {
  const out: Partial<ShiftTemplateInput> = {};
  if (typeof body.name === "string") out.name = body.name;
  if ("description" in body) out.description = nullableString(body.description);
  if ("color" in body) out.color = nullableString(body.color);
  if (typeof body.startTime === "string") out.startTime = body.startTime;
  if (typeof body.endTime === "string") out.endTime = body.endTime;
  if (typeof body.endsNextDay === "boolean") out.endsNextDay = body.endsNextDay;
  if ("secondStartTime" in body) out.secondStartTime = nullableString(body.secondStartTime);
  if ("secondEndTime" in body) out.secondEndTime = nullableString(body.secondEndTime);
  if (typeof body.breakMinutes === "number") out.breakMinutes = body.breakMinutes;
  if ("locationId" in body) out.locationId = nullableString(body.locationId);
  return out;
}

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const stringArray = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isString) ? v : null);

function readAudience(v: unknown): ApplicationAudience | null {
  const a = (v ?? {}) as Record<string, unknown>;
  switch (a.kind) {
    case "employees": {
      const ids = stringArray(a.employeeIds);
      return ids ? { kind: "employees", employeeIds: ids } : null;
    }
    case "all":
      return { kind: "all" };
    case "position":
      return isString(a.positionId) ? { kind: "position", positionId: a.positionId, locationId: isString(a.locationId) ? a.locationId : null } : null;
    case "location":
      return isString(a.locationId) ? { kind: "location", locationId: a.locationId } : null;
    default:
      return null;
  }
}

function readDays(v: unknown): ApplicationDays | null {
  const d = (v ?? {}) as Record<string, unknown>;
  if (d.kind === "dates") {
    const dates = stringArray(d.dates);
    return dates ? { kind: "dates", dates } : null;
  }
  if (d.kind === "range" && isString(d.from) && isString(d.to) && Array.isArray(d.weekdays)) {
    const weekdays = d.weekdays.filter((w): w is 0 | 1 | 2 | 3 | 4 | 5 | 6 => Number.isInteger(w) && (w as number) >= 0 && (w as number) <= 6);
    return { kind: "range", from: d.from, to: d.to, weekdays };
  }
  return null;
}

function readDecisions(v: unknown): Record<string, OccurrenceDecision> {
  const out: Record<string, OccurrenceDecision> = {};
  for (const [key, raw] of Object.entries((v ?? {}) as Record<string, unknown>)) {
    const d = (raw ?? {}) as Record<string, unknown>;
    if (d.action === "create" || d.action === "skip") out[key] = { action: d.action };
    else if (d.action === "replace" && isString(d.existingShiftId)) out[key] = { action: "replace", existingShiftId: d.existingShiftId };
  }
  return out;
}

/** Corpo comum a pré-visualizar/aplicar; `null` se faltar algo estrutural. */
function readConfig(templateId: string, body: Record<string, unknown>): TemplateApplicationConfig | null {
  const audience = readAudience(body.audience);
  const days = readDays(body.days);
  if (!audience || !days) return null;
  return { templateId, audience, days, locationId: isString(body.locationId) ? body.locationId : null };
}

/**
 * Escalas & Turnos → Modelos & Automatizações → Modelos de turno (RH 2.0,
 * ticket 01). Leitura para qualquer role do RH; escrita `manager`, como o
 * resto das Escalas. Nunca há DELETE — só inativar.
 */
export class HrShiftTemplatesController {
  readonly router: Router;

  constructor(
    private readonly listShiftTemplates: ListShiftTemplatesPort,
    private readonly createShiftTemplate: CreateShiftTemplatePort,
    private readonly updateShiftTemplate: UpdateShiftTemplatePort,
    private readonly setShiftTemplateActive: SetShiftTemplateActivePort,
    private readonly previewTemplateApplication: PreviewTemplateApplicationPort,
    private readonly applyTemplate: ApplyTemplatePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /api/hr/schedules/templates — ativos primeiro. */
    this.router.get("/hr/schedules/templates", async (req, res) => {
      try {
        res.json(await this.listShiftTemplates.execute(req.auth!.orgId));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/schedules/templates — body `ShiftTemplateInput`. */
    this.router.post("/hr/schedules/templates", requireMinRole("manager"), async (req, res) => {
      try {
        const input = readInput((req.body ?? {}) as Record<string, unknown>);
        if (input.name === undefined || input.startTime === undefined || input.endTime === undefined) {
          res.status(400).json({ error: "name, startTime e endTime são obrigatórios" });
          return;
        }
        const created = await this.createShiftTemplate.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
          startTime: input.startTime,
          endTime: input.endTime,
          endsNextDay: input.endsNextDay ?? false,
          secondStartTime: input.secondStartTime ?? null,
          secondEndTime: input.secondEndTime ?? null,
          breakMinutes: input.breakMinutes ?? 0,
          locationId: input.locationId ?? null,
        });
        res.status(201).json(created);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /api/hr/schedules/templates/:id — alteração parcial (só afeta utilizações futuras). */
    this.router.patch("/hr/schedules/templates/:id", requireMinRole("manager"), async (req, res) => {
      try {
        res.json(
          await this.updateShiftTemplate.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
            ...readInput((req.body ?? {}) as Record<string, unknown>),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/schedules/templates/:id/apply/preview — body `{ audience, days, locationId? }`. Não grava nada. */
    this.router.post("/hr/schedules/templates/:id/apply/preview", requireMinRole("manager"), async (req, res) => {
      try {
        const config = readConfig(req.params["id"] as string, (req.body ?? {}) as Record<string, unknown>);
        if (!config) {
          res.status(400).json({ error: "audience e days são obrigatórios" });
          return;
        }
        res.json(await this.previewTemplateApplication.execute({ organizationId: req.auth!.orgId, ...config }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/schedules/templates/:id/apply — body `{ audience, days, locationId?, decisions }`. Revalida tudo antes de gravar. */
    this.router.post("/hr/schedules/templates/:id/apply", requireMinRole("manager"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const config = readConfig(req.params["id"] as string, body);
        if (!config) {
          res.status(400).json({ error: "audience e days são obrigatórios" });
          return;
        }
        res.json(
          await this.applyTemplate.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            ...config,
            decisions: readDecisions(body.decisions),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /api/hr/schedules/templates/:id/active — body `{ active: boolean }`. */
    this.router.patch("/hr/schedules/templates/:id/active", requireMinRole("manager"), async (req, res) => {
      try {
        const active = (req.body as { active?: unknown } | undefined)?.active;
        if (typeof active !== "boolean") {
          res.status(400).json({ error: "active deve ser booleano" });
          return;
        }
        res.json(
          await this.setShiftTemplateActive.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
            active,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
