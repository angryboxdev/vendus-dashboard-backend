import { Router, type Request, type Response } from "express";
import { can } from "../../../access/domain/services/effective-access.service.js";
import { InvalidPortalRequestError, PortalRequestNotPendingError, type PortalRequestKind } from "../../domain/entities/portal-request.js";
import { PortalResourceNotFoundError, RequestNotAllowedError } from "../../domain/errors.js";
import type { ListPendingDocumentsPort } from "../../domain/ports/in/employee-document.ports.js";
import type { DecidePortalRequestPort, GetRequestAttachmentUrlPort, ListInboxRequestsPort } from "../../domain/ports/in/portal-requests.ports.js";

/**
 * Caixa de pedidos (Portal ticket 13) — o que os colaboradores enviaram e
 * aguarda decisão. Cada um só vê/decide o que as suas permissões cobrem:
 * documentos → `hr.documents`, justificações de falta → `hr.attendance`,
 * folgas → `hr.schedules` (o gerente; RH/admin sem escalas não as vê).
 * A rota é "base"; o filtro por permissão é feito aqui.
 */
function scopeOf(req: Request): { kinds: PortalRequestKind[]; documents: boolean } {
  const a = req.access;
  if (!a) return { kinds: [], documents: false };
  const kinds: PortalRequestKind[] = [];
  if (can(a, "hr.attendance", "MANAGE")) kinds.push("justify_absence");
  if (can(a, "hr.schedules", "MANAGE")) kinds.push("day_off");
  return { kinds, documents: can(a, "hr.documents", "MANAGE") };
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof PortalResourceNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  if (e instanceof RequestNotAllowedError) {
    res.status(403).json({ error: e.message });
    return;
  }
  if (e instanceof InvalidPortalRequestError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof PortalRequestNotPendingError) {
    res.status(409).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

export class HrRequestsController {
  readonly router: Router;

  constructor(
    private readonly listInbox: ListInboxRequestsPort,
    private readonly listPendingDocuments: ListPendingDocumentsPort,
    private readonly decide: DecidePortalRequestPort,
    private readonly attachmentUrl: GetRequestAttachmentUrlPort,
  ) {
    this.router = Router();

    /** GET /api/hr/requests — pedidos e documentos por decidir, no âmbito de quem pede. */
    this.router.get("/hr/requests", async (req, res) => {
      try {
        const scope = scopeOf(req);
        const [requests, documents] = await Promise.all([
          this.listInbox.execute({ organizationId: req.auth!.orgId, kinds: scope.kinds }),
          scope.documents ? this.listPendingDocuments.execute({ organizationId: req.auth!.orgId }) : Promise.resolve([]),
        ]);
        res.json({ requests, documents, total: requests.length + documents.length });
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/requests/:id/decide { decision: approve|reject, note } */
    this.router.post("/hr/requests/:id/decide", async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (body.decision !== "approve" && body.decision !== "reject") {
          res.status(400).json({ error: "decision deve ser 'approve' ou 'reject'" });
          return;
        }
        res.json(
          await this.decide.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            requestId: req.params.id as string,
            decision: body.decision,
            note: typeof body.note === "string" ? body.note : null,
            allowedKinds: scopeOf(req).kinds,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** GET /api/hr/requests/:id/attachment-url — anexo de uma justificação (URL assinada curta). */
    this.router.get("/hr/requests/:id/attachment-url", async (req, res) => {
      try {
        res.json(await this.attachmentUrl.execute({ organizationId: req.auth!.orgId, requestId: req.params.id as string, allowedKinds: scopeOf(req).kinds }));
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
