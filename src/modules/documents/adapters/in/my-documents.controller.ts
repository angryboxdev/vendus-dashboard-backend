import { Router, type Request, type Response } from "express";
import multer from "multer";
import { PortalBadRequestError, PortalNotLinkedError, PortalResourceNotFoundError } from "../../domain/errors.js";
import type { GetMyDocumentUrlPort, ListMyDocumentsPort, PortalIdentity, ReplaceMyDocumentPort } from "../../domain/ports/in/my-document.ports.js";

function handleError(e: unknown, res: Response): void {
  if (e instanceof PortalNotLinkedError) {
    res.status(403).json({ error: e.message, code: "PORTAL_NOT_LINKED" });
    return;
  }
  if (e instanceof PortalResourceNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  if (e instanceof PortalBadRequestError) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

function identity(req: Request): PortalIdentity {
  return { organizationId: req.auth!.orgId, userId: req.auth!.sub, actor: req.auth!.email };
}

/** Portal: PDF ou foto do telemóvel, até 10 MB. */
const portalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)),
});

/**
 * Portal do Colaborador — documentos do próprio (`/me/documents*`; ADR-0040,
 * fase 1: mesmos caminhos e respostas que no RH antigo). O colaborador é
 * sempre o da sessão. Montado junto das outras rotas `/me` (matriz: `portal`).
 */
export class MyDocumentsController {
  readonly router: Router;

  constructor(
    private readonly listMyDocuments: ListMyDocumentsPort,
    private readonly getMyDocumentUrl: GetMyDocumentUrlPort,
    private readonly replaceMyDocument: ReplaceMyDocumentPort,
  ) {
    this.router = Router();
    const run = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
      try {
        res.json(await fn(req));
      } catch (e) {
        handleError(e, res);
      }
    };
    this.router.get("/me/documents", run((req) => this.listMyDocuments.execute(identity(req))));
    this.router.get("/me/documents/:id/download-url", run((req) => this.getMyDocumentUrl.execute(identity(req), req.params.id as string)));
    this.router.post("/me/documents/:id/replace", portalUpload.single("file"), async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "Escolha um PDF ou uma foto (JPG/PNG) até 10 MB." });
          return;
        }
        const body = (req.body ?? {}) as Record<string, string | undefined>;
        res.json(
          await this.replaceMyDocument.execute({
            ...identity(req),
            documentId: req.params.id as string,
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
