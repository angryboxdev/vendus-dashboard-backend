import { Router } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import {
  DocumentCategoryConfigAlreadyExistsError,
  DocumentCategoryConfigNotFoundError,
  InvalidEmployeeError,
} from "../../domain/errors.js";
import type {
  ListDocumentCategoriesPort,
  CreateDocumentCategoryPort,
  UpdateDocumentCategoryPort,
  SetDocumentCategoryActivePort,
} from "../../domain/ports/in/document-category.ports.js";
import type { JobRole } from "../../domain/entities/employee.js";

const JOB_ROLES = new Set(["manager", "prep", "service"]);
const ACCEPTED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function readJobRoles(value: unknown): JobRole[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const roles = value.filter((v): v is JobRole => typeof v === "string" && JOB_ROLES.has(v));
  return roles;
}

function readAcceptedMimeTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string" && ACCEPTED_MIME_TYPES.has(v));
}

export class HrDocumentCategoriesController {
  readonly router: Router;

  constructor(
    private readonly listDocumentCategories: ListDocumentCategoriesPort,
    private readonly createDocumentCategory: CreateDocumentCategoryPort,
    private readonly updateDocumentCategory: UpdateDocumentCategoryPort,
    private readonly setDocumentCategoryActive: SetDocumentCategoryActivePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /api/hr/document-categories — lista (qualquer role autenticado). */
    this.router.get("/hr/document-categories", async (req, res) => {
      try {
        const result = await this.listDocumentCategories.execute({ organizationId: req.auth!.orgId });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/document-categories — criar. */
    this.router.post("/hr/document-categories", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.label !== "string" || body.label.trim().length === 0) {
          res.status(400).json({ error: "label é obrigatório" });
          return;
        }
        const result = await this.createDocumentCategory.execute({
          organizationId: req.auth!.orgId,
          label: body.label,
          mandatory: body.mandatory === true,
          jobRoles: readJobRoles(body.jobRoles) ?? [],
          acceptedMimeTypes: readAcceptedMimeTypes(body.acceptedMimeTypes) ?? [...ACCEPTED_MIME_TYPES],
        });
        res.status(201).json(result);
      } catch (e) {
        if (e instanceof InvalidEmployeeError) {
          res.status(400).json({ error: e.message });
          return;
        }
        if (e instanceof DocumentCategoryConfigAlreadyExistsError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** PATCH /api/hr/document-categories/:id — editar. */
    this.router.patch("/hr/document-categories/:id", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const jobRoles = readJobRoles(body.jobRoles);
        const acceptedMimeTypes = readAcceptedMimeTypes(body.acceptedMimeTypes);
        const result = await this.updateDocumentCategory.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          ...(typeof body.label === "string" && { label: body.label }),
          ...(typeof body.mandatory === "boolean" && { mandatory: body.mandatory }),
          ...(jobRoles !== undefined && { jobRoles }),
          ...(acceptedMimeTypes !== undefined && { acceptedMimeTypes }),
        });
        res.json(result);
      } catch (e) {
        if (e instanceof DocumentCategoryConfigNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** PATCH /api/hr/document-categories/:id/active — ativar/desativar. */
    this.router.patch("/hr/document-categories/:id/active", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.setDocumentCategoryActive.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          active: body.active === true,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof DocumentCategoryConfigNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}
