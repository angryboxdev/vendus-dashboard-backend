import { Router } from "express";
import type { GetRecipeCostingPort } from "../../domain/ports/in/get-recipe-costing.port.js";

export class RecipeCostingController {
  readonly router: Router;

  constructor(private readonly getRecipeCosting: GetRecipeCostingPort) {
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
  }
}
