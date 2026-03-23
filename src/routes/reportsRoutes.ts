import { ENV } from "../config/env.js";
import { Router } from "express";
import { buildMonthlySummary } from "../services/monthlySummaryService.js";
import { fetchAllDocuments } from "../services/documentsService.js";
import {
  getIngredientConsumption,
  getDefaultPeriod,
} from "../services/ingredientConsumptionService.js";

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
      store_id: storeIdParam,
    } = req.query as Record<string, string | undefined>;

    const perPage = Number(per_page);
    const conc = Number(concurrency);
    const vendus_selfconsumption_store_id =
      storeIdParam != null && storeIdParam !== ""
        ? Number(storeIdParam)
        : undefined;
    if (
      vendus_selfconsumption_store_id != null &&
      !Number.isFinite(vendus_selfconsumption_store_id)
    ) {
      res.status(400).json({ error: "store_id inválido" });
      return;
    }

    const response = await buildMonthlySummary({
      since,
      until,
      type,
      perPage,
      concurrency: conc,
      fetchAllDocuments,
      ...(vendus_selfconsumption_store_id != null
        ? { vendus_selfconsumption_store_id }
        : {}),
    });

    res.json(response);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Painel: consumo de ingredientes no período (pizzas via receitas + mapeamento Vendus).
 * GET /api/reports/ingredient-consumption?since=YYYY-MM-DD&until=YYYY-MM-DD
 * Se since/until omitidos, usa ontem.
 */
reportsRoutes.get("/reports/ingredient-consumption", async (req, res) => {
  try {
    const { since, until, store_id: storeIdParam } = req.query as Record<
      string,
      string | undefined
    >;
    const defaultPeriod = getDefaultPeriod();
    const sinceParam = since ?? defaultPeriod.since;
    const untilParam = until ?? defaultPeriod.until;
    const vendus_store_id =
      storeIdParam != null && storeIdParam !== ""
        ? Number(storeIdParam)
        : undefined;
    if (vendus_store_id != null && !Number.isFinite(vendus_store_id)) {
      res.status(400).json({ error: "store_id inválido" });
      return;
    }

    const response = await getIngredientConsumption(sinceParam, untilParam, {
      ...(vendus_store_id != null ? { vendus_store_id } : {}),
    });
    res.json(response);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter consumo de ingredientes";
    res.status(500).json({ error: message });
  }
});
