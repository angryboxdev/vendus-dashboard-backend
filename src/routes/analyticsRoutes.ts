import { Router } from "express";
import { buildAnalyticsCurrent, buildAnalyticsHistorical } from "../services/analyticsDashboardService.js";
import { DateTime } from "luxon";

export const analyticsRoutes = Router();

function parseYearMonth(req: any, res: any): { year: number; month: number } | null {
  const now = DateTime.now().setZone("Europe/Lisbon");
  const year = req.query.year ? Number(req.query.year) : now.year;
  const month = req.query.month ? Number(req.query.month) : now.month;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "Parâmetro 'year' inválido" });
    return null;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: "Parâmetro 'month' inválido (1-12)" });
    return null;
  }
  return { year, month };
}

/**
 * GET /api/analytics/current?year=2026&month=5
 * Dados rápidos: hoje, mês, anual, por dia da semana, crescimento mensal (ano atual).
 */
analyticsRoutes.get("/analytics/current", async (req, res) => {
  try {
    const params = parseYearMonth(req, res);
    if (!params) return;
    const data = await buildAnalyticsCurrent(params);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/analytics/historical?year=2026&month=5
 * Dados lentos: faturação total histórica + suplemento do gráfico de crescimento.
 */
analyticsRoutes.get("/analytics/historical", async (req, res) => {
  try {
    const params = parseYearMonth(req, res);
    if (!params) return;
    const data = await buildAnalyticsHistorical(req.auth!.orgId, params);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
