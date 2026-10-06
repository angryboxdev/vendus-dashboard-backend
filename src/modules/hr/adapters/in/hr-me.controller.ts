import { Router, type Request, type Response } from "express";
import { PortalNotLinkedError, PunchRefusedError } from "../../domain/errors.js";
import type { GetPortalHomePort, PortalIdentity, RegisterPunchPort } from "../../domain/ports/in/portal-me.ports.js";
import type { ClientLocation } from "../../domain/services/punch-geofence.service.js";

function handleError(e: unknown, res: Response): void {
  if (e instanceof PortalNotLinkedError) {
    res.status(403).json({ error: e.message, code: "PORTAL_NOT_LINKED" });
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
  ) {
    this.router = Router();

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
