import { Router } from "express";
import type { GetRecipeCostingPort } from "../../domain/ports/in/get-recipe-costing.port.js";
import type { GetIngredientPriceHistoryPort } from "../../domain/ports/in/get-ingredient-price-history.port.js";
import type { GetDishWeeklyCostPort } from "../../domain/ports/in/get-dish-weekly-cost.port.js";

export class RecipeCostingController {
  readonly router: Router;

  constructor(
    private readonly getRecipeCosting: GetRecipeCostingPort,
    private readonly getPriceHistory: GetIngredientPriceHistoryPort,
    private readonly getDishWeeklyCost: GetDishWeeklyCostPort,
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
