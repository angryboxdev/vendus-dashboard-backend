import { Router, type Response } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import {
  InvalidShiftAutomationError,
  InvalidTemplateApplicationError,
  ShiftAutomationNotFoundError,
  ShiftTemplateNotFoundError,
} from "../../domain/errors.js";
import type {
  CreateShiftAutomationPort,
  DismissAutomationIssuePort,
  GenerateAutomationPort,
  ListShiftAutomationsPort,
  SetShiftAutomationStatusPort,
  ShiftAutomationInput,
  UpdateShiftAutomationPort,
} from "../../domain/ports/in/shift-automation.ports.js";
import { isString, readAudience, readWeekdays } from "./http-readers.js";

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidShiftAutomationError || e instanceof InvalidTemplateApplicationError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof ShiftAutomationNotFoundError || e instanceof ShiftTemplateNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/** Campos enviados (só os presentes — o PATCH não sobrescreve o resto); validação de negócio no domínio. */
function readInput(body: Record<string, unknown>): Partial<ShiftAutomationInput> | null {
  const out: Partial<ShiftAutomationInput> = {};
  if (typeof body.name === "string") out.name = body.name;
  if ("description" in body) out.description = isString(body.description) ? body.description : null;
  if (isString(body.templateId)) out.templateId = body.templateId;
  if ("audience" in body) {
    const audience = readAudience(body.audience);
    if (!audience) return null;
    out.audience = audience;
  }
  if ("locationId" in body) out.locationId = isString(body.locationId) ? body.locationId : null;
  if ("weekdays" in body) {
    const weekdays = readWeekdays(body.weekdays);
    if (!weekdays) return null;
    out.weekdays = weekdays;
  }
  if (isString(body.startDate)) out.startDate = body.startDate;
  if ("endDate" in body) out.endDate = isString(body.endDate) ? body.endDate : null;
  if (typeof body.horizonWeeks === "number") out.horizonWeeks = body.horizonWeeks;
  return out;
}

/**
 * Escalas & Turnos → Modelos & Automatizações → Automatizações (RH 2.0,
 * ticket 03). Leitura para qualquer role do RH; escrita/geração `manager`.
 * A geração diária automática usa o cron interno (`hr-shift-automations`).
 */
export class HrShiftAutomationsController {
  readonly router: Router;

  constructor(
    private readonly listShiftAutomations: ListShiftAutomationsPort,
    private readonly createShiftAutomation: CreateShiftAutomationPort,
    private readonly updateShiftAutomation: UpdateShiftAutomationPort,
    private readonly setShiftAutomationStatus: SetShiftAutomationStatusPort,
    private readonly generateAutomation: GenerateAutomationPort,
    private readonly dismissAutomationIssue: DismissAutomationIssuePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /api/hr/schedules/automations — ativas primeiro. */
    this.router.get("/hr/schedules/automations", async (req, res) => {
      try {
        res.json(await this.listShiftAutomations.execute(req.auth!.orgId));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/schedules/automations — body `ShiftAutomationInput` + `generateNow?`. */
    this.router.post("/hr/schedules/automations", requireMinRole("manager"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const input = readInput(body);
        if (!input || input.name === undefined || !input.templateId || !input.audience || !input.weekdays || !input.startDate) {
          res.status(400).json({ error: "name, templateId, audience, weekdays e startDate são obrigatórios" });
          return;
        }
        const result = await this.createShiftAutomation.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          name: input.name,
          description: input.description ?? null,
          templateId: input.templateId,
          audience: input.audience,
          locationId: input.locationId ?? null,
          weekdays: input.weekdays,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          horizonWeeks: input.horizonWeeks ?? 4,
          generateNow: body.generateNow === true,
        });
        res.status(201).json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /api/hr/schedules/automations/:id — só afeta gerações futuras. */
    this.router.patch("/hr/schedules/automations/:id", requireMinRole("manager"), async (req, res) => {
      try {
        const input = readInput((req.body ?? {}) as Record<string, unknown>);
        if (!input) {
          res.status(400).json({ error: "audience/weekdays inválidos" });
          return;
        }
        res.json(await this.updateShiftAutomation.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, id: req.params["id"] as string, ...input }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /api/hr/schedules/automations/:id/status — body `{ status: "active" | "paused" }`. */
    this.router.patch("/hr/schedules/automations/:id/status", requireMinRole("manager"), async (req, res) => {
      try {
        const status = (req.body as { status?: unknown } | undefined)?.status;
        if (status !== "active" && status !== "paused") {
          res.status(400).json({ error: "status deve ser active ou paused" });
          return;
        }
        res.json(await this.setShiftAutomationStatus.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, id: req.params["id"] as string, status }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/schedules/automations/:id/generate — body `{ weeks? }` ("Gerar próximas X semanas"). */
    this.router.post("/hr/schedules/automations/:id/generate", requireMinRole("manager"), async (req, res) => {
      try {
        const weeks = (req.body as { weeks?: unknown } | undefined)?.weeks;
        res.json(
          await this.generateAutomation.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
            ...(typeof weeks === "number" && { weeks }),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/schedules/automation-issues/:id/dismiss — retira a ocorrência de "Alertas e ações". */
    this.router.post("/hr/schedules/automation-issues/:id/dismiss", requireMinRole("manager"), async (req, res) => {
      try {
        await this.dismissAutomationIssue.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, id: req.params["id"] as string });
        res.status(204).send();
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
