import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireMinRole } from "../../../../middleware/auth.js";
import { DocumentNotPendingError, DocumentRejectionReasonRequiredError } from "../../domain/entities/document.js";
import {
  DocumentCategoryAlreadyExistsError,
  DocumentNotCurrentError,
  DocumentPeriodAlreadyExistsError,
  EmployeeDocumentNotFoundError,
  EmployeeNotFoundError,
  InvalidDocumentError,
} from "../../domain/errors.js";
import type {
  GetDocumentOverviewPort,
  GetEmployeeDocumentSummaryPort,
  GetEmployeeDocumentDownloadUrlPort,
  GetEmployeeDocumentHistoryPort,
  ListEmployeeDocumentsPort,
  RemoveEmployeeDocumentPort,
  ReplaceEmployeeDocumentPort,
  ReviewEmployeeDocumentPort,
  UploadEmployeeDocumentPort,
} from "../../domain/ports/in/employee-document.ports.js";

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype));
  },
});

/**
 * Documentos de colaborador (ADR-0040, fase 1 — vindos do RH antigo, mesmo
 * comportamento e mesmas respostas). Servidos em `/novo-rh/people/:id/documents*`
 * (Novo RH) e, até à fase 4, também em `/hr/people/:id/documents*` (RH antigo).
 * Permissão `hr.documents` (matriz); escritas também exigem manager+.
 */
export class EmployeeDocumentsController {
  readonly router: Router;

  constructor(
    private readonly listEmployeeDocuments: ListEmployeeDocumentsPort,
    private readonly uploadEmployeeDocument: UploadEmployeeDocumentPort,
    private readonly replaceEmployeeDocument: ReplaceEmployeeDocumentPort,
    private readonly removeEmployeeDocument: RemoveEmployeeDocumentPort,
    private readonly getEmployeeDocumentDownloadUrl: GetEmployeeDocumentDownloadUrlPort,
    private readonly getEmployeeDocumentHistory: GetEmployeeDocumentHistoryPort,
    private readonly getDocumentOverview: GetDocumentOverviewPort,
    private readonly reviewEmployeeDocument: ReviewEmployeeDocumentPort,
    private readonly getEmployeeDocumentSummary: GetEmployeeDocumentSummaryPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** Visão agregada: 1 linha por (colaborador ativo × requisito documental). */
    const overview = async (req: Request, res: Response) => {
      try {
        res.json(await this.getDocumentOverview.execute({ organizationId: req.auth!.orgId }));
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    };
    this.router.get("/novo-rh/documents/overview", overview);
    this.router.get("/hr/document-overview", overview);

    /** Resumo documental da ficha do Novo RH (obrigatórios, em falta, alertas). Só Novo RH. */
    this.router.get("/novo-rh/people/:id/documents/summary", async (req, res) => {
      try {
        res.json(await this.getEmployeeDocumentSummary.execute({ organizationId: req.auth!.orgId, employeeId: req.params["id"] as string }));
      } catch (e) {
        if (e instanceof EmployeeNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    for (const people of ["/novo-rh/people", "/hr/people"]) {
      /** GET …/:id/documents — versões atuais. */
      this.router.get(`${people}/:id/documents`, async (req, res) => {
        try {
          const result = await this.listEmployeeDocuments.execute({
            organizationId: req.auth!.orgId,
            employeeId: req.params["id"] as string,
          });
          res.json(result);
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      });

      /** POST …/:id/documents (multipart "file") — nova categoria (ou novo período, nas categorias periódicas: campo "period" YYYY-MM). */
      this.router.post(`${people}/:id/documents`, requireMinRole("manager"), documentUpload.single("file"), async (req, res) => {
        try {
          if (!req.file) {
            res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: pdf, jpg, png" });
            return;
          }
          const body = req.body as Record<string, string | undefined>;
          if (!body.category) {
            res.status(400).json({ error: "category é obrigatório" });
            return;
          }
          const origin = body.origin === "colaborador" || body.origin === "sistema" ? body.origin : "rh";
          const result = await this.uploadEmployeeDocument.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            employeeId: req.params["id"] as string,
            category: body.category,
            mandatory: body.mandatory === "true",
            origin,
            expiresAt: body.expiresAt || null,
            period: body.period || null,
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
          });
          res.status(201).json(result);
        } catch (e) {
          if (e instanceof EmployeeNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
          }
          if (e instanceof DocumentCategoryAlreadyExistsError) {
            res.status(409).json({ error: e.message });
            return;
          }
          if (e instanceof DocumentPeriodAlreadyExistsError) {
            res.status(409).json({ error: e.message, code: "period_already_exists", existingDocumentId: e.existingDocumentId });
            return;
          }
          if (e instanceof InvalidDocumentError) {
            res.status(400).json({ error: e.message });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      });

      /** POST …/:id/documents/:docId/review — validar/rejeitar um envio do colaborador (Portal). */
      this.router.post(`${people}/:id/documents/:docId/review`, requireMinRole("manager"), async (req, res) => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (body.decision !== "approve" && body.decision !== "reject") {
            res.status(400).json({ error: "decision deve ser 'approve' ou 'reject'" });
            return;
          }
          res.json(
            await this.reviewEmployeeDocument.execute({
              organizationId: req.auth!.orgId,
              actor: req.auth!.email,
              employeeId: req.params["id"] as string,
              documentId: req.params["docId"] as string,
              decision: body.decision,
              ...(typeof body.note === "string" && { note: body.note }),
              ...("expiresAt" in body && { expiresAt: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null }),
            }),
          );
        } catch (e) {
          if (e instanceof EmployeeDocumentNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
          }
          if (e instanceof DocumentNotPendingError) {
            res.status(409).json({ error: e.message });
            return;
          }
          if (e instanceof DocumentRejectionReasonRequiredError) {
            res.status(400).json({ error: e.message });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      });

      /** POST …/:id/documents/:docId/replace (multipart "file") — nova versão. */
      this.router.post(
        `${people}/:id/documents/:docId/replace`,
        requireMinRole("manager"),
        documentUpload.single("file"),
        async (req, res) => {
          try {
            if (!req.file) {
              res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: pdf, jpg, png" });
              return;
            }
            const body = req.body as Record<string, string | undefined>;
            const result = await this.replaceEmployeeDocument.execute({
              organizationId: req.auth!.orgId,
              actor: req.auth!.email,
              employeeId: req.params["id"] as string,
              documentId: req.params["docId"] as string,
              ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt || null }),
              buffer: req.file.buffer,
              filename: req.file.originalname,
              mimeType: req.file.mimetype,
            });
            res.json(result);
          } catch (e) {
            if (e instanceof EmployeeNotFoundError || e instanceof EmployeeDocumentNotFoundError) {
              res.status(404).json({ error: e.message });
              return;
            }
            if (e instanceof DocumentNotCurrentError) {
              res.status(409).json({ error: e.message });
              return;
            }
            res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
          }
        },
      );

      /** DELETE …/:id/documents/:docId — remoção lógica. */
      this.router.delete(`${people}/:id/documents/:docId`, requireMinRole("manager"), async (req, res) => {
        try {
          await this.removeEmployeeDocument.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            employeeId: req.params["id"] as string,
            documentId: req.params["docId"] as string,
          });
          res.status(204).send();
        } catch (e) {
          if (e instanceof EmployeeDocumentNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
          }
          if (e instanceof DocumentNotCurrentError) {
            res.status(409).json({ error: e.message });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      });

      /** GET …/:id/documents/:docId/download-url — URL assinado (120s). */
      this.router.get(`${people}/:id/documents/:docId/download-url`, async (req, res) => {
        try {
          const result = await this.getEmployeeDocumentDownloadUrl.execute({
            organizationId: req.auth!.orgId,
            employeeId: req.params["id"] as string,
            documentId: req.params["docId"] as string,
          });
          res.json(result);
        } catch (e) {
          if (e instanceof EmployeeDocumentNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      });

      /** GET …/:id/documents/:docId/history — cadeia de versões da categoria. */
      this.router.get(`${people}/:id/documents/:docId/history`, async (req, res) => {
        try {
          const result = await this.getEmployeeDocumentHistory.execute({
            organizationId: req.auth!.orgId,
            employeeId: req.params["id"] as string,
            documentId: req.params["docId"] as string,
          });
          res.json(result);
        } catch (e) {
          if (e instanceof EmployeeDocumentNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      });
    }
  }
}
