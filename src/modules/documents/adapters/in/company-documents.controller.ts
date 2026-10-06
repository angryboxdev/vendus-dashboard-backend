import { Router, type Response } from "express";
import multer from "multer";
import { requireMinRole } from "../../../../middleware/auth.js";
import type { AppRole } from "../../../../middleware/auth.js";
import type { DocumentVisibility } from "../../domain/entities/document.js";
import {
  DocumentCategoryAlreadyExistsError,
  DocumentCategoryConfigNotFoundError,
  DocumentNotCurrentError,
  DocumentNotFoundError,
  InvalidDocumentError,
} from "../../domain/errors.js";
import type {
  DocumentViewerRole,
  GetCompanyDocumentDownloadUrlPort,
  GetCompanyDocumentHistoryPort,
  ListCompanyDocumentsPort,
  RemoveCompanyDocumentPort,
  ReplaceCompanyDocumentPort,
  UploadCompanyDocumentPort,
} from "../../domain/ports/in/company-document.ports.js";

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB, como os documentos de colaborador
  fileFilter: (_req, file, cb) => {
    cb(null, ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype));
  },
});

/** `AppRole` e `DocumentViewerRole` têm os mesmos valores — só o domínio não pode importar o tipo do middleware. */
function toViewerRole(role: AppRole): DocumentViewerRole {
  // `employee` nunca chega aqui (`restrictEmployeeToPortal`); se chegasse, recusa — nunca promove a hr_viewer.
  if (role === "employee") throw new Error("Sem permissão para esta operação");
  return role;
}

function readDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readVisibility(value: unknown): DocumentVisibility | undefined {
  return value === "management" || value === "admin" ? value : undefined;
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidDocumentError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof DocumentCategoryAlreadyExistsError || e instanceof DocumentNotCurrentError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (e instanceof DocumentNotFoundError || e instanceof DocumentCategoryConfigNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/**
 * Empresa & Estrutura → Documentos (`/api/company-documents`). Só gestão:
 * `manager`+ (o perfil só-leitura de RH nunca vê documentos da Empresa — D11).
 * Nunca há hard delete: DELETE é remoção lógica.
 */
export class CompanyDocumentsController {
  readonly router: Router;

  constructor(
    private readonly listCompanyDocuments: ListCompanyDocumentsPort,
    private readonly uploadCompanyDocument: UploadCompanyDocumentPort,
    private readonly replaceCompanyDocument: ReplaceCompanyDocumentPort,
    private readonly removeCompanyDocument: RemoveCompanyDocumentPort,
    private readonly getCompanyDocumentDownloadUrl: GetCompanyDocumentDownloadUrlPort,
    private readonly getCompanyDocumentHistory: GetCompanyDocumentHistoryPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    const BASE = "/company-documents";

    this.router.get(BASE, requireMinRole("manager"), async (req, res) => {
      try {
        res.json(await this.listCompanyDocuments.execute({ organizationId: req.auth!.orgId, viewerRole: toViewerRole(req.auth!.orgRole) }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST (multipart: file, category, issuedAt?, expiresAt?, visibility?) — primeira versão de uma categoria. */
    this.router.post(BASE, requireMinRole("manager"), documentUpload.single("file"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!req.file) {
          res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: pdf, jpg, png" });
          return;
        }
        if (typeof body.category !== "string" || body.category.length === 0) {
          res.status(400).json({ error: "category é obrigatório" });
          return;
        }
        const created = await this.uploadCompanyDocument.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          viewerRole: toViewerRole(req.auth!.orgRole),
          category: body.category,
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          issuedAt: readDate(body.issuedAt),
          expiresAt: readDate(body.expiresAt),
          visibility: readVisibility(body.visibility) ?? "management",
        });
        res.status(201).json(created);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /:id/replace (multipart) — renovação: nova versão atual, a anterior fica "Substituída". */
    this.router.post(`${BASE}/:id/replace`, requireMinRole("manager"), documentUpload.single("file"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!req.file) {
          res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: pdf, jpg, png" });
          return;
        }
        const visibility = readVisibility(body.visibility);
        res.json(
          await this.replaceCompanyDocument.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            viewerRole: toViewerRole(req.auth!.orgRole),
            documentId: req.params["id"] as string,
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            issuedAt: readDate(body.issuedAt),
            expiresAt: readDate(body.expiresAt),
            ...(visibility && { visibility }),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** DELETE /:id — remoção lógica. */
    this.router.delete(`${BASE}/:id`, requireMinRole("manager"), async (req, res) => {
      try {
        await this.removeCompanyDocument.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          viewerRole: toViewerRole(req.auth!.orgRole),
          documentId: req.params["id"] as string,
        });
        res.status(204).send();
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get(`${BASE}/:id/download-url`, requireMinRole("manager"), async (req, res) => {
      try {
        res.json(
          await this.getCompanyDocumentDownloadUrl.execute({
            organizationId: req.auth!.orgId,
            viewerRole: toViewerRole(req.auth!.orgRole),
            documentId: req.params["id"] as string,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get(`${BASE}/:id/history`, requireMinRole("manager"), async (req, res) => {
      try {
        res.json(
          await this.getCompanyDocumentHistory.execute({
            organizationId: req.auth!.orgId,
            viewerRole: toViewerRole(req.auth!.orgRole),
            documentId: req.params["id"] as string,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
