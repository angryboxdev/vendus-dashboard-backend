import { Router, type Response } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import {
  DocumentCategoryConfigAlreadyExistsError,
  DocumentCategoryConfigNotFoundError,
  InvalidDocumentError,
} from "../../domain/errors.js";
import type {
  ListDocumentCategoriesPort,
  CreateDocumentCategoryPort,
  UpdateDocumentCategoryPort,
  SetDocumentCategoryActivePort,
} from "../../domain/ports/in/document-category.ports.js";
import type { DocumentCategoryScope, OperationalCategory } from "../../domain/entities/document-category.js";

const JOB_ROLES = new Set(["manager", "prep", "service"]);
const SCOPES = new Set<DocumentCategoryScope>(["employee", "company", "both"]);
const ACCEPTED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

/**
 * Os mesmos endpoints em dois prefixos: `/hr/document-categories` (rota
 * histórica, usada pelo ecrã de documentos dos Colaboradores) e
 * `/document-categories` (Empresa & Estrutura → Documentos). Uma única fonte
 * de categorias para os dois — só muda o caminho.
 */
const PREFIXES = ["/hr/document-categories", "/document-categories"];

function readJobRoles(value: unknown): OperationalCategory[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is OperationalCategory => typeof v === "string" && JOB_ROLES.has(v));
}

function readAcceptedMimeTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string" && ACCEPTED_MIME_TYPES.has(v));
}

function readScope(value: unknown): DocumentCategoryScope | undefined {
  return typeof value === "string" && SCOPES.has(value as DocumentCategoryScope) ? (value as DocumentCategoryScope) : undefined;
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidDocumentError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof DocumentCategoryConfigAlreadyExistsError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (e instanceof DocumentCategoryConfigNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

export class DocumentCategoriesController {
  readonly router: Router;

  constructor(
    private readonly listDocumentCategories: ListDocumentCategoriesPort,
    private readonly createDocumentCategory: CreateDocumentCategoryPort,
    private readonly updateDocumentCategory: UpdateDocumentCategoryPort,
    private readonly setDocumentCategoryActive: SetDocumentCategoryActivePort,
  ) {
    this.router = Router();
    for (const prefix of PREFIXES) this.registerRoutes(prefix);
  }

  private registerRoutes(prefix: string): void {
    /** GET — lista (qualquer role autenticado); `?ownerType=employee|company` filtra pelo âmbito. */
    this.router.get(prefix, async (req, res) => {
      try {
        const ownerType = req.query["ownerType"];
        res.json(
          await this.listDocumentCategories.execute({
            organizationId: req.auth!.orgId,
            ...((ownerType === "employee" || ownerType === "company") && { ownerType }),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST — criar. Âmbito omitido = `employee` (comportamento anterior). */
    this.router.post(prefix, requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.label !== "string" || body.label.trim().length === 0) {
          res.status(400).json({ error: "label é obrigatório" });
          return;
        }
        if ("scope" in body && !readScope(body.scope)) {
          res.status(400).json({ error: "scope inválido (employee|company|both)" });
          return;
        }
        const scope = readScope(body.scope);
        const result = await this.createDocumentCategory.execute({
          organizationId: req.auth!.orgId,
          label: body.label,
          mandatory: body.mandatory === true,
          jobRoles: readJobRoles(body.jobRoles) ?? [],
          acceptedMimeTypes: readAcceptedMimeTypes(body.acceptedMimeTypes) ?? [...ACCEPTED_MIME_TYPES],
          ...(scope && { scope }),
        });
        res.status(201).json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /:id — editar. */
    this.router.patch(`${prefix}/:id`, requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if ("scope" in body && !readScope(body.scope)) {
          res.status(400).json({ error: "scope inválido (employee|company|both)" });
          return;
        }
        const jobRoles = readJobRoles(body.jobRoles);
        const acceptedMimeTypes = readAcceptedMimeTypes(body.acceptedMimeTypes);
        const scope = readScope(body.scope);
        res.json(
          await this.updateDocumentCategory.execute({
            organizationId: req.auth!.orgId,
            id: req.params["id"] as string,
            ...(typeof body.label === "string" && { label: body.label }),
            ...(typeof body.mandatory === "boolean" && { mandatory: body.mandatory }),
            ...(jobRoles !== undefined && { jobRoles }),
            ...(acceptedMimeTypes !== undefined && { acceptedMimeTypes }),
            ...(scope && { scope }),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /:id/active — ativar/desativar. */
    this.router.patch(`${prefix}/:id/active`, requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        res.json(
          await this.setDocumentCategoryActive.execute({
            organizationId: req.auth!.orgId,
            id: req.params["id"] as string,
            active: body.active === true,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
