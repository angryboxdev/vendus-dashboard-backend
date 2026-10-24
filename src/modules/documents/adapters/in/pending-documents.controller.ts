import { Router } from "express";
import type { ListPendingDocumentsPort } from "../../domain/ports/in/employee-document.ports.js";

/**
 * Novo RH — envios do Portal por validar (`GET /novo-rh/documents/pending`,
 * `hr.documents`), mais antigos primeiro. Validar/rejeitar continua em
 * `POST /novo-rh/people/:id/documents/:docId/review` (gerente ou acima).
 */
export class PendingDocumentsController {
  readonly router: Router;

  constructor(private readonly listPending: ListPendingDocumentsPort) {
    this.router = Router();
    this.router.get("/novo-rh/documents/pending", async (req, res) => {
      try {
        res.json(await this.listPending.execute({ organizationId: req.auth!.orgId }));
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}
