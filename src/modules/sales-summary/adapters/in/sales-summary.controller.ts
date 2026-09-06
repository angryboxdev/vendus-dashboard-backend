import { Router } from "express";
import type { GetSalesSummaryPort } from "../../domain/ports/in/get-sales-summary.port.js";
import type { GetGrowthChartPort } from "../../domain/ports/in/get-growth-chart.port.js";

export class SalesSummaryController {
  readonly router: Router;

  constructor(
    private readonly getSalesSummary: GetSalesSummaryPort,
    private readonly getGrowthChart: GetGrowthChartPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /sales-summary?year=&month=
     * Returns SalesSummaryResult from cache or live APIs.
     */
    this.router.get("/sales-summary", async (req, res) => {
      try {
        const year = Number(req.query["year"]);
        const month = Number(req.query["month"]);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          res.status(400).json({ error: "year must be a valid integer" });
          return;
        }
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          res.status(400).json({ error: "month must be between 1 and 12" });
          return;
        }
        const result = await this.getSalesSummary.execute({
          organizationId: req.auth!.orgId,
          year,
          month,
          forceRefresh: false,
        });
        res.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });

    /**
     * POST /sales-summary/refresh?year=&month=
     * Forces recalculation, saves to cache, returns fresh SalesSummaryResult.
     */
    this.router.post("/sales-summary/refresh", async (req, res) => {
      try {
        const year = Number(req.query["year"]);
        const month = Number(req.query["month"]);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          res.status(400).json({ error: "year must be a valid integer" });
          return;
        }
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          res.status(400).json({ error: "month must be between 1 and 12" });
          return;
        }
        const result = await this.getSalesSummary.execute({
          organizationId: req.auth!.orgId,
          year,
          month,
          forceRefresh: true,
        });
        res.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /sales-summary/growth?year=
     * Returns MonthlyGrowthPoint[] for all 12 months of the year.
     */
    this.router.get("/sales-summary/growth", async (req, res) => {
      try {
        const year = Number(req.query["year"]);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          res.status(400).json({ error: "year must be a valid integer" });
          return;
        }
        const result = await this.getGrowthChart.execute({
          organizationId: req.auth!.orgId,
          year,
        });
        res.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });
  }
}
