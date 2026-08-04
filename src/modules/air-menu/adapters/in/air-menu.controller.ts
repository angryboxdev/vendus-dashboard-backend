import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { GetEnterprisesPort } from "../../domain/ports/in/get-enterprises.port.js";
import type { GetSummaryPort } from "../../domain/ports/in/get-summary.port.js";
import type { GetOrderRawPort } from "../../domain/ports/in/get-order-raw.port.js";
import type { RegisterWebhookPort } from "../../domain/ports/in/register-webhook.port.js";
import type { OrderEventBusPort } from "../../domain/ports/out/order-event-bus.port.js";
import type { AirMenuOrder } from "../../domain/entities/air-menu-order.js";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function parseDateRange(
  startParam: string | undefined,
  endParam: string | undefined,
): { startDate: Date; endDate: Date } | { error: string } {
  const today = new Date();
  const startDate = startParam ? startOfDay(new Date(startParam)) : startOfDay(today);
  const endDate = endParam ? endOfDay(new Date(endParam)) : endOfDay(today);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { error: "startDate ou endDate inválido (use YYYY-MM-DD)" };
  }
  return { startDate, endDate };
}

function toOrderDto(o: AirMenuOrder): Omit<AirMenuOrder, "rawData"> {
  return {
    orderId: o.orderId,
    platform: o.platform,
    divisionName: o.divisionName,
    orderDate: o.orderDate,
    documentDate: o.documentDate,
    paymentMethod: o.paymentMethod,
    items: o.items,
    total: o.total,
    firstName: o.firstName,
    lastName: o.lastName,
    activeFlags: o.activeFlags,
    providerOrderId: o.providerOrderId,
    documentType: o.documentType,
    extraInfo: o.extraInfo,
  };
}

export class AirMenuController {
  readonly router: Router;
  /** Routes that must be public (webhook receiver + SSE stream). */
  readonly publicRouter: Router;

  constructor(
    private readonly getEnterprises: GetEnterprisesPort,
    private readonly getSummary: GetSummaryPort,
    private readonly getOrderRaw: GetOrderRawPort,
    private readonly registerWebhook: RegisterWebhookPort,
    private readonly eventBus: OrderEventBusPort,
    private readonly webhookSecret: string | null,
  ) {
    this.router = Router();
    this.publicRouter = Router();
    this.registerRoutes();
  }

  private verifySignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return true; // skip if no secret configured
    const expected = createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  private registerRoutes(): void {
    // ── Public routes (no auth) ───────────────────────────────────────────────

    /**
     * POST /api/air-menu/webhook/receive
     * Receives order event notifications from AirMenu.
     * Must be registered as a public route (before requireAuth in server.ts).
     *
     * Signature verification uses the HMAC-SHA256 of the raw JSON body with
     * AIRMENU_WEBHOOK_SECRET. AirMenu sends the signature in the header
     * X-AirMenu-Signature (TODO: confirm exact header name with AirMenu docs).
     *
     * NOTE: express.json() parses the body before this handler runs, so
     * verification uses JSON.stringify(req.body). This is accurate as long as
     * AirMenu sends compact JSON. For byte-exact verification, capture the raw
     * body before express.json() (see Express rawBody middleware pattern).
     */
    this.publicRouter.post("/air-menu/webhook/receive", (req, res) => {
      const signature = req.headers["x-airmenu-signature"];

      if (this.webhookSecret && typeof signature === "string") {
        const rawBody = JSON.stringify(req.body);
        if (!this.verifySignature(rawBody, signature)) {
          res.status(401).json({ error: "Invalid webhook signature" });
          return;
        }
      }

      const body = req.body as Record<string, unknown>;
      const enterpriseId =
        typeof body["enterpriseId"] === "string" ? body["enterpriseId"] : "unknown";
      const event = typeof body["event"] === "string" ? body["event"] : "UNKNOWN";
      const resource = typeof body["resource"] === "string" ? body["resource"] : "order";

      console.log(`[AirMenu webhook] ${event} ${resource} enterprise=${enterpriseId}`);

      this.eventBus.publish({
        enterpriseId,
        event,
        resource,
        payload: body,
        receivedAt: new Date(),
      });

      res.status(200).json({ ok: true });
    });

    /**
     * GET /api/air-menu/webhook/stream?enterpriseId=xxx
     * Server-Sent Events stream for the KDS frontend.
     * Sends a heartbeat every 30 s to keep the connection alive.
     * Optionally filters events by enterpriseId.
     */
    this.publicRouter.get("/air-menu/webhook/stream", (req, res) => {
      const { enterpriseId } = req.query as { enterpriseId?: string };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      // Send initial "connected" event
      res.write(`event: connected\ndata: {}\n\n`);

      const unsubscribe = this.eventBus.subscribe((event) => {
        if (enterpriseId && event.enterpriseId !== enterpriseId) return;
        const data = JSON.stringify(event);
        res.write(`event: order\ndata: ${data}\n\n`);
      });

      const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
      }, 30_000);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    });

    // ── Protected routes (require auth, registered on this.router) ────────────

    /**
     * GET /api/air-menu/enterprises
     */
    this.router.get("/air-menu/enterprises", (_req, res) => {
      res.json(this.getEnterprises.execute());
    });

    /**
     * GET /api/air-menu/orders/:orderId/raw?enterpriseId=xxx
     * Devolve os dados brutos da API AirMenu para um pedido específico.
     */
    this.router.get("/air-menu/orders/:orderId/raw", async (req, res) => {
      const { orderId } = req.params as { orderId: string };
      const { enterpriseId } = req.query as { enterpriseId?: string };

      if (!enterpriseId) {
        res.status(400).json({ error: "enterpriseId é obrigatório" });
        return;
      }

      const enterprises = this.getEnterprises.execute();
      if (!enterprises.some((e) => e.id === enterpriseId)) {
        res.status(400).json({ error: "enterpriseId inválido" });
        return;
      }

      try {
        const raw = await this.getOrderRaw.execute(enterpriseId, orderId);
        res.json(raw);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[AirMenu] GET /air-menu/orders/:orderId/raw falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /api/air-menu/summary?enterpriseId=xxx[&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
     * Devolve { orders, analytics } numa única chamada.
     * As orders NÃO incluem rawData — usar /orders/:orderId/raw para dados brutos.
     */
    this.router.get("/air-menu/summary", async (req, res) => {
      const { enterpriseId, startDate: startParam, endDate: endParam } = req.query as {
        enterpriseId?: string;
        startDate?: string;
        endDate?: string;
      };

      if (!enterpriseId) {
        res.status(400).json({ error: "enterpriseId é obrigatório" });
        return;
      }

      const enterprises = this.getEnterprises.execute();
      if (!enterprises.some((e) => e.id === enterpriseId)) {
        res.status(400).json({ error: "enterpriseId inválido" });
        return;
      }

      const range = parseDateRange(startParam, endParam);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }

      try {
        const { orders, analytics } = await this.getSummary.execute(
          enterpriseId,
          range.startDate,
          range.endDate,
        );
        res.json({ orders: orders.map(toOrderDto), analytics });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[AirMenu] GET /air-menu/summary falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * POST /api/air-menu/webhook/register
     * Registers a webhook with AirMenu for the given enterprise.
     * Body: { enterpriseId, url, events?, resource?, secret? }
     */
    this.router.post("/air-menu/webhook/register", async (req, res) => {
      const { enterpriseId, url, events, resource, secret } = req.body as {
        enterpriseId?: string;
        url?: string;
        events?: string[];
        resource?: string;
        secret?: string;
      };

      if (!enterpriseId || !url) {
        res.status(400).json({ error: "enterpriseId e url são obrigatórios" });
        return;
      }

      const enterprises = this.getEnterprises.execute();
      if (!enterprises.some((e) => e.id === enterpriseId)) {
        res.status(400).json({ error: "enterpriseId inválido" });
        return;
      }

      try {
        const webhook = await this.registerWebhook.execute({
          enterpriseId,
          url,
          ...(events !== undefined && { events }),
          ...(resource !== undefined && { resource }),
          ...(secret !== undefined && { secret }),
        });
        res.status(201).json(webhook);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[AirMenu] POST /air-menu/webhook/register falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });
  }
}
