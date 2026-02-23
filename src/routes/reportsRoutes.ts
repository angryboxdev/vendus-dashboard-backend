import { ENV } from "../config/env.js";
import { Router } from "express";
import { buildMonthlySummary } from "../services/monthlySummaryService.js";
import { fetchAllDocuments } from "../services/documentsService.js";

export const reportsRoutes = Router();

/**
 * ✅ ENDPOINT PRINCIPAL: resumo do mês
 * GET /api/reports/monthly-summary?since=...&until=...&type=FS
 */
reportsRoutes.get("/reports/monthly-summary", async (req, res) => {
  try {
    const {
      since = "2026-01-01",
      until = "2026-01-31",
      type = "FS,NC",
      per_page = String(ENV.PER_PAGE_DEFAULT),
      concurrency = String(ENV.CONCURRENCY),
    } = req.query as Record<string, string>;

    const perPage = Number(per_page);
    const conc = Number(concurrency);

    const response = await buildMonthlySummary({
      since,
      until,
      type,
      perPage,
      concurrency: conc,
      fetchAllDocuments,
    });

    res.json(response);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
