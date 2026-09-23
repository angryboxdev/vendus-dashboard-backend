import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { HandleOrderDispatchedPort } from "../../domain/ports/in/handle-order-dispatched.port.js";
import type { HandleOrderPickedUpPort } from "../../domain/ports/in/handle-order-picked-up.port.js";
import type { HandleOrderCancelledPort } from "../../domain/ports/in/handle-order-cancelled.port.js";
import type { GlovoOrder } from "../../domain/entities/glovo-order.js";
import type { GlovoOrderPickedUp } from "../../domain/entities/glovo-order-picked-up.js";
import type { GlovoOrderCancelled } from "../../domain/entities/glovo-order-cancelled.js";

export class GlovoController {
  readonly publicRouter: Router;

  constructor(
    private readonly handleOrderDispatched: HandleOrderDispatchedPort,
    private readonly handleOrderPickedUp: HandleOrderPickedUpPort,
    private readonly handleOrderCancelled: HandleOrderCancelledPort,
    private readonly webhookToken: string | null,
  ) {
    this.publicRouter = Router();
    this.registerRoutes();
  }

  /**
   * Verifica o header Authorization: Bearer <token> enviado pela Glovo.
   * Usa timingSafeEqual para evitar timing attacks.
   * Se webhookToken não estiver configurado, aceita tudo (útil em dev/stage).
   */
  private verifyToken(authHeader: string | undefined): boolean {
    if (!this.webhookToken) return true;
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return false;
    const received = authHeader.slice(7);
    try {
      return timingSafeEqual(Buffer.from(received), Buffer.from(this.webhookToken));
    } catch {
      return false;
    }
  }

  private registerRoutes(): void {
    /**
     * POST /glovo/orders/dispatched
     * Glovo envia o pedido completo quando é criado/enviado para a loja.
     * Resposta esperada: 200 OK em menos de 10 s.
     */
    this.publicRouter.post("/glovo/orders/dispatched", async (req, res) => {
      console.log(`[Glovo webhook] ORDER_DISPATCHED ip=${req.ip}`);

      if (!this.verifyToken(req.headers.authorization)) {
        console.warn("[Glovo webhook] token inválido — 401");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      if (typeof body.order_id !== "string" || !body.order_id ||
          typeof body.store_id !== "string" || !body.store_id) {
        res.status(400).json({ error: "Invalid payload: order_id and store_id are required" });
        return;
      }

      try {
        await this.handleOrderDispatched.execute(body as unknown as GlovoOrder);
        res.status(200).json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Internal error";
        console.error("[Glovo webhook] ORDER_DISPATCHED falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * POST /glovo/orders/picked_up
     * Glovo notifica quando o courier recolheu o pedido.
     */
    this.publicRouter.post("/glovo/orders/picked_up", async (req, res) => {
      console.log(`[Glovo webhook] ORDER_PICKED_UP ip=${req.ip}`);

      if (!this.verifyToken(req.headers.authorization)) {
        console.warn("[Glovo webhook] token inválido — 401");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      if (typeof body.order_id !== "string" || !body.order_id ||
          typeof body.store_id !== "string" || !body.store_id) {
        res.status(400).json({ error: "Invalid payload: order_id and store_id are required" });
        return;
      }

      try {
        await this.handleOrderPickedUp.execute(body as unknown as GlovoOrderPickedUp);
        res.status(200).json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Internal error";
        console.error("[Glovo webhook] ORDER_PICKED_UP falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * POST /glovo/orders/cancelled
     * Glovo notifica quando um pedido é cancelado (por qualquer motivo).
     * Nenhuma resposta específica é esperada.
     */
    this.publicRouter.post("/glovo/orders/cancelled", async (req, res) => {
      console.log(`[Glovo webhook] ORDER_CANCELLED ip=${req.ip}`);

      if (!this.verifyToken(req.headers.authorization)) {
        console.warn("[Glovo webhook] token inválido — 401");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      if (typeof body.order_id !== "string" || !body.order_id ||
          typeof body.store_id !== "string" || !body.store_id) {
        res.status(400).json({ error: "Invalid payload: order_id and store_id are required" });
        return;
      }

      try {
        await this.handleOrderCancelled.execute(body as unknown as GlovoOrderCancelled);
        res.status(200).json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Internal error";
        console.error("[Glovo webhook] ORDER_CANCELLED falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });
  }
}
