import { Router } from "express";
import type { GetEnterprisesPort } from "../../domain/ports/in/get-enterprises.port.js";
import type { GetSummaryPort } from "../../domain/ports/in/get-summary.port.js";
import type { GetOrderRawPort } from "../../domain/ports/in/get-order-raw.port.js";
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

  constructor(
    private readonly getEnterprises: GetEnterprisesPort,
    private readonly getSummary: GetSummaryPort,
    private readonly getOrderRaw: GetOrderRawPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
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
  }
}
