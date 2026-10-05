import { Router, type Response } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import { DuplicateShiftTemplateNameError, InvalidShiftTemplateError, ShiftTemplateNotFoundError } from "../../domain/errors.js";
import type {
  CreateShiftTemplatePort,
  ListShiftTemplatesPort,
  SetShiftTemplateActivePort,
  ShiftTemplateInput,
  UpdateShiftTemplatePort,
} from "../../domain/ports/in/shift-template.ports.js";

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidShiftTemplateError) {
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
