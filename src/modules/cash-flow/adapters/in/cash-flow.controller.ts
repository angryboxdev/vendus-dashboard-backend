import { Router } from "express";
import type { GetCashFlowPort } from "../../domain/ports/in/get-cash-flow.port.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";

export class CashFlowController {
  readonly router: Router;

  constructor(private readonly getCashFlow: GetCashFlowPort) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /reports/dre/fluxo-caixa?year=&month=
     * Entradas vs saídas do banco por dia, despesas por centro de custo e % justificada.
     */
    this.router.get("/reports/dre/fluxo-caixa", async (req, res) => {
      try {
        const result = await this.getCashFlow.execute({
          organizationId: req.auth!.orgId,
          year: Number(req.query["year"]),
          month: Number(req.query["month"]),
        });
        res.json(result);
      } catch (e: unknown) {
        if (e instanceof InvalidCashFlowPeriodError) {
          res.status(400).json({ error: e.message });
          return;
        }
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });
  }
}
