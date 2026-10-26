import { Router } from "express";
import type { GetRecipeCostingPort } from "../../domain/ports/in/get-recipe-costing.port.js";
import type { GetIngredientPriceHistoryPort } from "../../domain/ports/in/get-ingredient-price-history.port.js";
import type { GetDishWeeklyCostPort } from "../../domain/ports/in/get-dish-weekly-cost.port.js";
import type { GetDishesImpactPort, GetIngredientUsagePort, GetIngredientsCostOverviewPort } from "../../domain/ports/in/ingredient-insights.port.js";

export class RecipeCostingController {
  readonly router: Router;

  constructor(
    private readonly getRecipeCosting: GetRecipeCostingPort,
    private readonly getPriceHistory: GetIngredientPriceHistoryPort,
    private readonly getDishWeeklyCost: GetDishWeeklyCostPort,
    private readonly getCostOverview: GetIngredientsCostOverviewPort,
    private readonly getIngredientUsage: GetIngredientUsagePort,
    private readonly getDishesImpact: GetDishesImpactPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.get("/recipe-costing", async (req, res) => {
      try {
        res.json(await this.getRecipeCosting.execute({ organizationId: req.auth!.orgId }));
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // Resumo de custos de todos os ingredientes (V6 §6): ?weeks=12 (1–52).
    this.router.get("/recipe-costing/ingredients/overview", async (req, res) => {
      try {
        const weeks = req.query.weeks !== undefined ? Number(req.query.weeks) : undefined;
        if (weeks !== undefined && !Number.isFinite(weeks)) {
          res.status(400).json({ error: "weeks inválido" });
          return;
        }
        res.json(await this.getCostOverview.execute({ organizationId: req.auth!.orgId, ...(weeks !== undefined && { weeks }) }));
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // Fichas técnicas que usam o ingrediente, com a parte no custo (V6 §7).
    this.router.get("/recipe-costing/ingredients/:id/usage", async (req, res) => {
      try {
        const usage = await this.getIngredientUsage.execute({ organizationId: req.auth!.orgId, stockItemId: req.params.id });
        if (!usage) {
          res.status(404).json({ error: "Artigo não encontrado" });
          return;
        }
        res.json(usage);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // Impacto do preço dos ingredientes nas pizzas (V6 §8): ?compareWeeks=4 (1–52).
    this.router.get("/recipe-costing/dishes/impact", async (req, res) => {
      try {
        const compareWeeks = req.query.compareWeeks !== undefined ? Number(req.query.compareWeeks) : undefined;
        if (compareWeeks !== undefined && !Number.isFinite(compareWeeks)) {
          res.status(400).json({ error: "compareWeeks inválido" });
          return;
        }
        res.json(await this.getDishesImpact.execute({ organizationId: req.auth!.orgId, ...(compareWeeks !== undefined && { compareWeeks }) }));
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // Custo teórico semanal de uma pizza por tamanho (task V5 §6): ?weeks=12 (1–104).
    this.router.get("/recipe-costing/dishes/:id/weekly", async (req, res) => {
      try {
        const weeks = req.query.weeks !== undefined ? Number(req.query.weeks) : undefined;
        if (weeks !== undefined && !Number.isFinite(weeks)) {
          res.status(400).json({ error: "weeks inválido" });
          return;
        }
        const result = await this.getDishWeeklyCost.execute({ organizationId: req.auth!.orgId, pizzaId: req.params.id, ...(weeks !== undefined && { weeks }) });
        if (!result) {
          res.status(404).json({ error: "Pizza não encontrada" });
          return;
        }
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // Histórico semanal do preço de compra (task V5 §5): ?weeks=26 (1–104).
    this.router.get("/recipe-costing/ingredients/:id/price-history", async (req, res) => {
      try {
        const weeks = req.query.weeks !== undefined ? Number(req.query.weeks) : undefined;
        if (weeks !== undefined && !Number.isFinite(weeks)) {
          res.status(400).json({ error: "weeks inválido" });
          return;
        }
        const history = await this.getPriceHistory.execute({ organizationId: req.auth!.orgId, stockItemId: req.params.id, ...(weeks !== undefined && { weeks }) });
        if (!history) {
          res.status(404).json({ error: "Artigo não encontrado" });
          return;
        }
        res.json(history);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}
