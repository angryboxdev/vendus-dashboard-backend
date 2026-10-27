import { Router } from "express";
import type { GetCashFlowPort } from "../../domain/ports/in/get-cash-flow.port.js";
import type { GetCashFlowToHandlePort } from "../../domain/ports/in/get-cash-flow-to-handle.port.js";
import type { GetDrePort } from "../../domain/ports/in/get-dre.port.js";
import type { GetSalesReconciliationPort } from "../../domain/ports/in/get-sales-reconciliation.port.js";
import type { GetDreParametersPort, SaveDreParametersPort } from "../../domain/ports/in/dre-parameters.port.js";
import type { DreParameters } from "../../domain/entities/dre-parameters.js";
import { InvalidCashFlowPeriodError, InvalidDreParametersError } from "../../domain/errors.js";

export class CashFlowController {
  readonly router: Router;

  constructor(
    private readonly getCashFlow: GetCashFlowPort,
    private readonly getToHandle: GetCashFlowToHandlePort,
    private readonly getDre: GetDrePort,
    private readonly getSalesReconciliation: GetSalesReconciliationPort,
    private readonly getDreParameters: GetDreParametersPort,
    private readonly saveDreParameters: SaveDreParametersPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /reports/dre/parametros?year=&month=
     * Parâmetros da DRE do mês (taxas do delivery, taxa do TPA, IVA teórico, marketing); `source` diz
     * se são do mês, herdados do último mês com valores ou os de omissão.
     */
    this.router.get("/reports/dre/parametros", async (req, res) => {
      try {
        res.json(await this.getDreParameters.execute({
          organizationId: req.auth!.orgId,
          year: Number(req.query["year"]),
          month: Number(req.query["month"]),
        }));
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
     * PUT /reports/dre/parametros?year=&month=
     * Grava os parâmetros do mês. Body: DreParameters (percentagens 0–100; marketing sem IVA, cêntimos).
     */
    this.router.put("/reports/dre/parametros", async (req, res) => {
      try {
        res.json(await this.saveDreParameters.execute({
          organizationId: req.auth!.orgId,
          year: Number(req.query["year"]),
          month: Number(req.query["month"]),
          parameters: (req.body ?? {}) as DreParameters,
          updatedBy: req.auth!.email ?? null,
        }));
      } catch (e: unknown) {
        if (e instanceof InvalidCashFlowPeriodError || e instanceof InvalidDreParametersError) {
          res.status(400).json({ error: e.message });
          return;
        }
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /reports/dre/conferencia-vendas?year=&month=
     * Vendas do restaurante no Vendus × banco: cartão ↔ créditos TPA (taxa implícita), numerário ↔ depósitos.
     */
    this.router.get("/reports/dre/conferencia-vendas", async (req, res) => {
      try {
        const result = await this.getSalesReconciliation.execute({
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
