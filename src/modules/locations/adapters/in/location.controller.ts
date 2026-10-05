import { Router, type Response } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import type { ListLocationsPort } from "../../domain/ports/in/list-locations.port.js";
import type {
  CreateLocationPort,
  ListLocationHistoryPort,
  SetLocationActivePort,
  UpdateLocationPort,
} from "../../domain/ports/in/manage-locations.port.js";
import type { LocationChanges, LocationDetails } from "../../domain/entities/location.js";
import { DuplicateLocationCodeError, InvalidLocationError, LocationNotFoundError } from "../../domain/errors.js";

const REQUIRED_STRING_FIELDS = ["name", "country", "timezone"] as const;
const NULLABLE_STRING_FIELDS = ["code", "address", "postalCode", "city", "municipality", "phone"] as const;

/** Só copia campos conhecidos com o tipo certo — `isActive`/`id` nunca entram pelo body de criação/edição. */
function parseChanges(body: Record<string, unknown>): LocationChanges | string {
  const changes: Record<string, string | null> = {};
  for (const field of REQUIRED_STRING_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string") return `${field} deve ser texto`;
    changes[field] = body[field] as string;
  }
  for (const field of NULLABLE_STRING_FIELDS) {
    if (body[field] === undefined) continue;
    if (body[field] !== null && typeof body[field] !== "string") return `${field} deve ser texto ou null`;
    changes[field] = body[field] as string | null;
  }
  return changes as LocationChanges;
}

function toDetails(changes: LocationChanges): LocationDetails {
  return {
    name: changes.name ?? "",
    code: changes.code ?? null,
    address: changes.address ?? null,
    postalCode: changes.postalCode ?? null,
    city: changes.city ?? null,
    municipality: changes.municipality ?? null,
    country: changes.country ?? "PT",
    timezone: changes.timezone ?? "Europe/Lisbon",
    phone: changes.phone ?? null,
  };
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidLocationError) {
    res.status(400).json({ error: e.message, fieldErrors: e.fieldErrors });
    return;
  }
  if (e instanceof DuplicateLocationCodeError) {
    res.status(409).json({ error: e.message, fieldErrors: [{ field: "code", message: "já usado noutro local" }] });
    return;
  }
  if (e instanceof LocationNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

export class LocationController {
  readonly router: Router;

  constructor(
    private readonly listLocations: ListLocationsPort,
    private readonly createLocation: CreateLocationPort,
    private readonly updateLocation: UpdateLocationPort,
    private readonly setLocationActive: SetLocationActivePort,
    private readonly listLocationHistory: ListLocationHistoryPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /locations
     * Lista as locations da organização do chamador (D15), ativas e
     * inativas. Mounted below the global `requireAuth` in server.ts, so
     * `req.auth` is always set; any authenticated role.
     */
    this.router.get("/locations", async (req, res) => {
      try {
        res.json(await this.listLocations.execute({ organizationId: req.auth!.orgId }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /locations — cria um Local (ativo). 400 com `fieldErrors`, 409 se o código já existir. */
    this.router.post("/locations", requireMinRole("admin"), async (req, res) => {
      try {
        const changes = parseChanges((req.body ?? {}) as Record<string, unknown>);
        if (typeof changes === "string") {
          res.status(400).json({ error: changes });
          return;
        }
        const created = await this.createLocation.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          details: toDetails(changes),
        });
        res.status(201).json(created);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /locations/:id — alteração parcial dos dados (não do estado). */
    this.router.patch("/locations/:id", requireMinRole("admin"), async (req, res) => {
      try {
        const changes = parseChanges((req.body ?? {}) as Record<string, unknown>);
        if (typeof changes === "string") {
          res.status(400).json({ error: changes });
          return;
        }
        res.json(
          await this.updateLocation.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            locationId: req.params["id"] as string,
            changes,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /locations/:id/active — body `{ active: boolean }`. Nunca existe DELETE. */
    this.router.patch("/locations/:id/active", requireMinRole("admin"), async (req, res) => {
      try {
        const active = (req.body as { active?: unknown } | undefined)?.active;
        if (typeof active !== "boolean") {
          res.status(400).json({ error: "active deve ser booleano" });
          return;
        }
        res.json(
          await this.setLocationActive.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            locationId: req.params["id"] as string,
            active,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** GET /locations/:id/history — histórico de alterações do Local. */
    this.router.get("/locations/:id/history", requireMinRole("admin"), async (req, res) => {
      try {
        res.json(
          await this.listLocationHistory.execute({
            organizationId: req.auth!.orgId,
            locationId: req.params["id"] as string,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
