import { Router, type Response } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import type { JobRole } from "../../domain/entities/employee.js";
import { DuplicatePositionNameError, InvalidPositionError, PositionNotFoundError } from "../../domain/errors.js";
import type {
  CreatePositionPort,
  ListPositionsPort,
  SetPositionActivePort,
  UpdatePositionPort,
} from "../../domain/ports/in/position.ports.js";

const OPERATIONAL_CATEGORIES = new Set<JobRole>(["manager", "prep", "service"]);

function readCategory(value: unknown): JobRole | undefined {
  return typeof value === "string" && OPERATIONAL_CATEGORIES.has(value as JobRole) ? (value as JobRole) : undefined;
}

function readDescription(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidPositionError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof DuplicatePositionNameError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (e instanceof PositionNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/**
 * Colaboradores → Cargos (Base Organizacional, ticket 07). Leitura para
 * qualquer role do RH (incl. `hr_viewer`); escrita `manager`, como o resto
 * do RH. Cargo ≠ permissão: nada aqui toca em `org_members`. Nunca há DELETE.
 */
export class HrPositionsController {
  readonly router: Router;

  constructor(
    private readonly listPositions: ListPositionsPort,
    private readonly createPosition: CreatePositionPort,
    private readonly updatePosition: UpdatePositionPort,
    private readonly setPositionActive: SetPositionActivePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /api/hr/positions — todos os cargos (ativos primeiro) com nº de colaboradores ativos. */
    this.router.get("/hr/positions", async (req, res) => {
      try {
        res.json(await this.listPositions.execute(req.auth!.orgId));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/positions — body `{ name, description?, operationalCategory }`. */
    this.router.post("/hr/positions", requireMinRole("manager"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const operationalCategory = readCategory(body.operationalCategory);
        if (typeof body.name !== "string" || !operationalCategory) {
          res.status(400).json({ error: "name e operationalCategory (manager|prep|service) são obrigatórios" });
          return;
        }
        const created = await this.createPosition.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          name: body.name,
          description: readDescription(body.description),
          operationalCategory,
        });
        res.status(201).json(created);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /api/hr/positions/:id — alteração parcial de nome/descrição/categoria. */
    this.router.patch("/hr/positions/:id", requireMinRole("manager"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if ("operationalCategory" in body && !readCategory(body.operationalCategory)) {
          res.status(400).json({ error: "operationalCategory inválida (manager|prep|service)" });
          return;
        }
        const category = readCategory(body.operationalCategory);
        res.json(
          await this.updatePosition.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
            ...(typeof body.name === "string" && { name: body.name }),
            ...("description" in body && { description: readDescription(body.description) }),
            ...(category && { operationalCategory: category }),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /api/hr/positions/:id/active — body `{ active: boolean }`. */
    this.router.patch("/hr/positions/:id/active", requireMinRole("manager"), async (req, res) => {
      try {
        const active = (req.body as { active?: unknown } | undefined)?.active;
        if (typeof active !== "boolean") {
          res.status(400).json({ error: "active deve ser booleano" });
          return;
        }
        res.json(
          await this.setPositionActive.execute({
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
