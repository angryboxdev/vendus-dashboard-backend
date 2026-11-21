import { Router, type Response } from "express";
import { SalesAnalysisValidationError, type SourceSelection } from "../../domain/entities/sales-analysis.js";
import type { FetchAirMenuMonthPort, GetSalesAnalysisPort, GetSalesForecastPort } from "../../domain/ports/in/sales-analysis.ports.js";

const SOURCES: SourceSelection[] = ["vendus", "airmenu", "both"];

function parseSource(v: unknown): SourceSelection {
  return SOURCES.includes(v as SourceSelection) ? (v as SourceSelection) : "vendus";
}

function fail(res: Response, e: unknown) {
  if (e instanceof SalesAnalysisValidationError) {
    res.status(400).json({ error: e.message });
    return;
  }
  console.error("[sales-analysis]", e);
  res.status(500).json({ error: "Não foi possível carregar a análise de vendas." });
}

/**
 * Rotas (permissão `sales.analysis`, ver route-permissions):
 * - GET  /sales-analysis?from=&to=&source=vendus|airmenu|both
 * - POST /sales-analysis/air-menu/fetch   { month: "AAAA-MM" }
 * - GET  /sales-analysis/forecast?source=
 */
export class SalesAnalysisController {
  readonly router = Router();

  constructor(
    private readonly getAnalysis: GetSalesAnalysisPort,
    private readonly fetchAirMenuMonth: FetchAirMenuMonthPort,
    private readonly getForecast: GetSalesForecastPort,
  ) {
    this.router.get("/sales-analysis", async (req, res) => {
      try {
        const data = await this.getAnalysis.execute({
          organizationId: req.auth!.orgId,
          range: { from: String(req.query["from"] ?? ""), to: String(req.query["to"] ?? "") },
          source: parseSource(req.query["source"]),
        });
        res.json(data);
      } catch (e) {
        fail(res, e);
      }
    });

    this.router.post("/sales-analysis/air-menu/fetch", async (req, res) => {
      try {
        const month = String((req.body as { month?: unknown } | undefined)?.month ?? "");
        res.status(202).json(await this.fetchAirMenuMonth.execute({ organizationId: req.auth!.orgId, month }));
      } catch (e) {
        fail(res, e);
      }
    });

    this.router.get("/sales-analysis/forecast", async (req, res) => {
      try {
        res.json(await this.getForecast.execute({ organizationId: req.auth!.orgId, source: parseSource(req.query["source"]) }));
      } catch (e) {
        fail(res, e);
      }
    });
  }
}
