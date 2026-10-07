import { Router, type Request, type Response } from "express";
import multer from "multer";
import { PortalBadRequestError, PortalNotLinkedError, PortalResourceNotFoundError, PunchRefusedError } from "../../domain/errors.js";
import type {
  GetMyDocumentUrlPort,
  GetMyLeavePort,
  GetPortalHomePort,
  ListMyCoworkersPort,
  ListMyDocumentsPort,
  ListMyShiftsPort,
  PortalIdentity,
  RegisterPunchPort,
  ReplaceMyDocumentPort,
} from "../../domain/ports/in/portal-me.ports.js";
import type { CancelMyRequestPort, CreateMyRequestPort, ListMyRequestsPort } from "../../domain/ports/in/portal-requests.ports.js";
import { InvalidPortalRequestError, PortalRequestNotPendingError } from "../../domain/entities/portal-request.js";
import type { ClientLocation } from "../../domain/services/punch-geofence.service.js";

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
  if (e instanceof InvalidPortalRequestError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof PortalRequestNotPendingError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (e instanceof PunchRefusedError) {
    res.status(409).json({ error: e.message, code: e.code, details: e.details });
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCATION_ERRORS = new Set(["permission_denied", "unavailable", "timeout"]);

/** Leitura crua do telemóvel — o servidor decide o resto. Valores inválidos contam como "sem leitura". */
function readLocation(raw: unknown): ClientLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.error === "string" && LOCATION_ERRORS.has(r.error)) return { kind: "error", reason: r.error as "permission_denied" };
  const { latitude, longitude, accuracyM } = r;
  if (
    typeof latitude === "number" && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && longitude >= -180 && longitude <= 180 &&
    typeof accuracyM === "number" && accuracyM >= 0
  ) {
    return { kind: "reading", latitude, longitude, accuracyM };
  }
  return null;
}

/**
 * Portal do Colaborador — rotas `/me` (tickets 03–05). Qualquer conta
 * autenticada ligada a uma ficha (o papel `employee` só chega aqui; um
 * gestor ligado à sua ficha também). O colaborador é sempre o da sessão.
 */
export class HrMeController {
  readonly router: Router;

  constructor(
    private readonly getPortalHome: GetPortalHomePort,
    private readonly registerPunch: RegisterPunchPort,
    private readonly selfService: {
      listMyShifts: ListMyShiftsPort;
      listMyCoworkers: ListMyCoworkersPort;
      listMyDocuments: ListMyDocumentsPort;
      getMyDocumentUrl: GetMyDocumentUrlPort;
      getMyLeave: GetMyLeavePort;
      replaceMyDocument: ReplaceMyDocumentPort;
      createMyRequest: CreateMyRequestPort;
      listMyRequests: ListMyRequestsPort;
      cancelMyRequest: CancelMyRequestPort;
    },
  ) {
    this.router = Router();
    const run = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
      try {
        res.json(await fn(req));
      } catch (e) {
        handleError(e, res);
      }
    };

    // Self-service (tickets 07–09) — sempre do colaborador da sessão.
    this.router.get("/me/shifts", run((req) => this.selfService.listMyShifts.execute(identity(req), String(req.query.from ?? ""), String(req.query.to ?? ""))));
    this.router.get("/me/shifts/:id/coworkers", run((req) => this.selfService.listMyCoworkers.execute(identity(req), req.params.id as string)));
    this.router.get("/me/documents", run((req) => this.selfService.listMyDocuments.execute(identity(req))));
    this.router.get("/me/documents/:id/download-url", run((req) => this.selfService.getMyDocumentUrl.execute(identity(req), req.params.id as string)));
    this.router.post("/me/documents/:id/replace", portalUpload.single("file"), async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "Escolha um PDF ou uma foto (JPG/PNG) até 10 MB." });
          return;
        }
        const body = (req.body ?? {}) as Record<string, string | undefined>;
        res.json(
          await this.selfService.replaceMyDocument.execute({
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
    // Pedidos (ticket 12): justificar falta (com anexo opcional) / pedir folga.
    this.router.get("/me/requests", run((req) => this.selfService.listMyRequests.execute(identity(req))));
    this.router.post("/me/requests/:id/cancel", run((req) => this.selfService.cancelMyRequest.execute(identity(req), req.params.id as string)));
    this.router.post("/me/requests", portalUpload.single("attachment"), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, string | undefined>;
        const reasonText = body.reasonText ?? null;
        const reasonCode = body.reasonCode ?? "";
        if (body.kind === "justify_absence") {
          res.json(
            await this.selfService.createMyRequest.execute({
              ...identity(req),
              kind: "justify_absence",
              workShiftId: body.workShiftId ?? "",
              reasonCode,
              reasonText,
              attachment: req.file ? { buffer: req.file.buffer, filename: req.file.originalname, mimeType: req.file.mimetype } : null,
            }),
          );
          return;
        }
        if (body.kind === "day_off") {
          res.json(
            await this.selfService.createMyRequest.execute({ ...identity(req), kind: "day_off", startDate: body.startDate ?? "", endDate: body.endDate ?? body.startDate ?? "", reasonCode, reasonText }),
          );
          return;
        }
        res.status(400).json({ error: "kind deve ser 'justify_absence' ou 'day_off'" });
      } catch (e) {
        handleError(e, res);
      }
    });
    this.router.get("/me/leave", run((req) => this.selfService.getMyLeave.execute(identity(req), Number(req.query.year ?? new Date().getFullYear()))));

    this.router.get("/me", async (req, res) => {
      try {
        res.json(await this.getPortalHome.execute(identity(req)));
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/me/punches", async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (body.kind !== "in" && body.kind !== "out") {
          res.status(400).json({ error: "kind deve ser 'in' ou 'out'" });
          return;
        }
        if (typeof body.idempotencyKey !== "string" || !UUID.test(body.idempotencyKey)) {
          res.status(400).json({ error: "idempotencyKey inválida" });
          return;
        }
        res.json(
          await this.registerPunch.execute({
            ...identity(req),
            kind: body.kind,
            idempotencyKey: body.idempotencyKey.toLowerCase(),
            location: readLocation(body.location),
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
