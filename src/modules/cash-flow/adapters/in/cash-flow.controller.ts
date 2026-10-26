import { Router } from "express";
import type { GetCashFlowPort } from "../../domain/ports/in/get-cash-flow.port.js";
import type { GetCashFlowToHandlePort } from "../../domain/ports/in/get-cash-flow-to-handle.port.js";
import type { GetDrePort } from "../../domain/ports/in/get-dre.port.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";

export class CashFlowController {
  readonly router: Router;

  constructor(
    private readonly getCashFlow: GetCashFlowPort,
    private readonly getToHandle: GetCashFlowToHandlePort,
    private readonly getDre: GetDrePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /reports/dre/resultado?year=&month=
     * DRE a partir da conciliação bancária: receita e gastos sem IVA, ajustes manuais e saldo do IVA.
     */
    this.router.get("/reports/dre/resultado", async (req, res) => {
      try {
        const result = await this.getDre.execute({
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

    /**
     * GET /reports/dre/fluxo-caixa/para-tratar
     * Estado atual (não depende do mês): contas a pagar em aberto / em atraso e faturas por rever.
     */
    this.router.get("/reports/dre/fluxo-caixa/para-tratar", async (req, res) => {
      try {
        res.json(await this.getToHandle.execute({ organizationId: req.auth!.orgId }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });

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
