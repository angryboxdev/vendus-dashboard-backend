import { Router } from "express";
import { problem } from "../../../../infra/http/problem-details.js";
import {
  StockDemoForbiddenError,
  StockDemoNotCreatedError,
  type CreateStockDemoPort,
  type DemoPosSalesPort,
  type GetStockDemoStatusPort,
  type ResetStockDemoPort,
} from "../../domain/ports/in/stock-demo.ports.js";
import { isStockDemoScenario } from "../../domain/entities/stock-demo.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class StockDemoController {
  readonly router: Router;

  constructor(
    private readonly status: GetStockDemoStatusPort,
    private readonly pos: DemoPosSalesPort,
    private readonly create: CreateStockDemoPort,
    private readonly reset: ResetStockDemoPort,
  ) {
    this.router = Router();
    const toProblem = (e: unknown) =>
      e instanceof StockDemoForbiddenError ? problem(403, "stock_demo_admin_only", e.message) : e instanceof StockDemoNotCreatedError ? problem(409, "stock_demo_not_created", e.message) : e;

    // Criar um cenário (só Admin; sempre na empresa real). Já criado → 200 sem mexer.
    this.router.post("/stock-demo/:scenario", async (req, res, next) => {
      try {
        const scenario = req.params.scenario;
        if (!isStockDemoScenario(scenario)) throw problem(400, "stock_demo_unknown_scenario", "Cenário de demonstração desconhecido.");
        const result = await this.create.execute({ realOrgId: req.auth!.orgId, isAdmin: req.access?.isAdmin === true, actor: req.auth!.email || req.auth!.sub, scenario });
        res.status(result.created ? 201 : 200).json(result);
      } catch (e) {
        next(toProblem(e));
      }
    });

    // Recomeçar: apaga os dados do cenário e volta a semear até hoje.
    this.router.post("/stock-demo/:scenario/reset", async (req, res, next) => {
      try {
        const scenario = req.params.scenario;
        if (!isStockDemoScenario(scenario)) throw problem(400, "stock_demo_unknown_scenario", "Cenário de demonstração desconhecido.");
        res.json(await this.reset.execute({ realOrgId: req.auth!.orgId, isAdmin: req.access?.isAdmin === true, scenario }));
      } catch (e) {
        next(toProblem(e));
      }
    });

    // Estado dos três cenários (sempre na empresa real; o botão «Demonstração» não envia X-Stock-Demo).
    this.router.get("/stock-demo", async (req, res, next) => {
      try {
        res.json(await this.status.execute({ realOrgId: req.auth!.orgId, isAdmin: req.access?.isAdmin === true }));
      } catch (e) {
        next(e instanceof StockDemoForbiddenError ? problem(403, "stock_demo_admin_only", e.message) : e);
      }
    });

    // «API» do CaixaFlow POS (fictício): vendas de um período, só em modo Demonstração (o middleware já trocou
    // para a organização fictícia). Fora de uma demo → 404: nunca devolve vendas reais.
    this.router.get("/stock-demo/pos/sales", async (req, res, next) => {
      try {
        const from = String(req.query.from ?? "");
        const to = String(req.query.to ?? from);
        if (!DATE.test(from) || !DATE.test(to) || from > to) throw problem(400, "invalid_period", "Período inválido (from/to em AAAA-MM-DD).");
        const sales = await this.pos.dailySales(req.auth!.orgId, from, to);
        if (!sales) throw problem(404, "stock_demo_not_active", "Só disponível em demonstração do Stock.");
        res.json({ pos: "CaixaFlow POS (fictício)", from, to, sales });
      } catch (e) {
        next(e);
      }
    });
  }
}
