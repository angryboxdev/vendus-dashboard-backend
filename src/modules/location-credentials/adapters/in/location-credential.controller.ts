import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, requireMinRole } from "../../../../middleware/auth.js";
import type { GeneratePairingCodePort } from "../../domain/ports/in/generate-pairing-code.port.js";
import type { RedeemPairingCodePort } from "../../domain/ports/in/redeem-pairing-code.port.js";
import type { ListActiveTokensPort } from "../../domain/ports/in/list-active-tokens.port.js";
import type { RevokeTokenPort } from "../../domain/ports/in/revoke-token.port.js";
import {
  LocationNotOwnedError,
  PairingCodeAlreadyUsedError,
  PairingCodeExpiredError,
  PairingCodeNotFoundError,
} from "../../domain/errors.js";

function jsonError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * Two routers, following `cash-closing.controller.ts`'s shape: `adminRouter`
 * for the admin-facing generate/list/revoke endpoints (behind `requireAuth`
 * + `requireMinRole("admin")`, per D6/story 1), `deviceRouter` for the
 * unpaired screen's redemption endpoint (no user auth at all — the caller
 * has no credential yet, that's the whole point).
 */
export class LocationCredentialController {
  readonly adminRouter: Router;
  readonly deviceRouter: Router;

  constructor(
    private readonly generatePairingCode: GeneratePairingCodePort,
    private readonly redeemPairingCode: RedeemPairingCodePort,
    private readonly listActiveTokens: ListActiveTokensPort,
    private readonly revokeToken: RevokeTokenPort,
  ) {
    this.adminRouter = Router();
    this.deviceRouter = Router();
    this.registerAdminRoutes();
    this.registerDeviceRoutes();
  }

  private registerAdminRoutes(): void {
    /**
     * POST /location-credentials/pairing-codes
     * Body: { locationId: string }
     */
    this.adminRouter.post(
      "/location-credentials/pairing-codes",
      requireAuth,
      requireMinRole("admin"),
      async (req: Request, res: Response) => {
        try {
          const body = req.body as { locationId?: unknown };
          if (typeof body.locationId !== "string" || body.locationId.trim().length === 0) {
            jsonError(res, 400, "locationId is required");
            return;
          }
          const result = await this.generatePairingCode.execute({
            organizationId: req.auth!.orgId,
            locationId: body.locationId,
          });
          res.status(201).json(result);
        } catch (e: unknown) {
          if (e instanceof LocationNotOwnedError) {
            jsonError(res, 404, e.message);
            return;
          }
          const msg = e instanceof Error ? e.message : "Internal error";
          res.status(500).json({ error: msg });
        }
      },
    );

    /**
     * GET /location-credentials/locations/:locationId/tokens
     * Lists issue dates only — no per-device naming (D3).
     */
    this.adminRouter.get(
      "/location-credentials/locations/:locationId/tokens",
      requireAuth,
      requireMinRole("admin"),
      async (req: Request, res: Response) => {
        try {
          const tokens = await this.listActiveTokens.execute({
            organizationId: req.auth!.orgId,
            locationId: req.params["locationId"] as string,
          });
          res.json(tokens);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Internal error";
          res.status(500).json({ error: msg });
        }
      },
    );

    /**
     * DELETE /location-credentials/tokens/:tokenId
     * Revokes one token. No effect on any other token, even at the same
     * location (D4) — idempotent: revoking an id that doesn't exist (or
     * already belongs to no one) is not an error.
     */
    this.adminRouter.delete(
      "/location-credentials/tokens/:tokenId",
      requireAuth,
      requireMinRole("admin"),
      async (req: Request, res: Response) => {
        try {
          await this.revokeToken.execute({
            organizationId: req.auth!.orgId,
            tokenId: req.params["tokenId"] as string,
          });
          res.status(204).send();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Internal error";
          res.status(500).json({ error: msg });
        }
      },
    );
  }

  private registerDeviceRoutes(): void {
    /**
     * POST /location-credentials/redeem
     * Body: { code: string }
     * No authenticated caller — this is how an unpaired screen gets its
     * first credential. The code is burned on this attempt regardless of
     * the outcome (D6).
     */
    this.deviceRouter.post("/location-credentials/redeem", async (req: Request, res: Response) => {
      try {
        const body = req.body as { code?: unknown };
        if (typeof body.code !== "string" || body.code.trim().length === 0) {
          jsonError(res, 400, "code is required");
          return;
        }
        const result = await this.redeemPairingCode.execute({ code: body.code });
        res.status(201).json(result);
      } catch (e: unknown) {
        if (e instanceof PairingCodeNotFoundError) {
          jsonError(res, 404, e.message);
          return;
        }
        if (e instanceof PairingCodeAlreadyUsedError) {
          jsonError(res, 409, e.message);
          return;
        }
        if (e instanceof PairingCodeExpiredError) {
          jsonError(res, 410, e.message);
          return;
        }
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });
  }
}
