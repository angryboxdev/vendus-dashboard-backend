import { Router } from "express";
import type { ListLocationsPort } from "../../domain/ports/in/list-locations.port.js";

export class LocationController {
  readonly router: Router;

  constructor(private readonly listLocations: ListLocationsPort) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /locations
     * Lista as locations da organização do chamador (D15). Mounted below
     * the global `requireAuth` in server.ts, so `req.auth` is always set.
     */
    this.router.get("/locations", async (req, res) => {
      try {
        const locations = await this.listLocations.execute({
          organizationId: req.auth!.orgId,
        });
        res.json(locations);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });
  }
}
