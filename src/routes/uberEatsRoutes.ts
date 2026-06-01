import express from "express";
import { ENV } from "../config/env.js";
import { handleUberEatsWebhook } from "../services/uberEatsService.js";

export const uberEatsRoutes = express.Router();

/**
 * POST /api/uber-eats/webhook
 *
 * Endpoint público (sem JWT) — verificação por HMAC-SHA256 (X-Uber-Signature).
 * Precisa de express.raw() ANTES de express.json() global (ver server.ts).
 *
 * Uber Eats envia event_type "orders.notification" para cada mudança de estado.
 * Só processamos quando meta.status === "ACCEPTED".
 */
uberEatsRoutes.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!ENV.UBER_EATS_CLIENT_ID) {
      res.status(503).json({ error: "Uber Eats integration não configurada" });
      return;
    }

    const signature = req.headers["x-uber-signature"] as string | undefined;
    const rawBody = req.body as Buffer;

    try {
      const result = await handleUberEatsWebhook(rawBody, signature);
      res.json(result);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      console.error("[uber-eats] webhook error:", e.message);
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  }
);
