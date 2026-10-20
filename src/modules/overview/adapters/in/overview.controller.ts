import { Router, type Request } from "express";
import { problem } from "../../../../infra/http/problem-details.js";
import { OverviewValidationError, type OverviewUseCases, type OverviewViewer } from "../../application/use-cases/overview.use-cases.js";

/**
 * `GET /api/novo-rh/overview?date=AAAA-MM-DD` (`hr.overview`) — painel do dia;
 * `GET /api/novo-rh/overview/plan?from&to` — horários planeados da equipa (FE-031). Só leitura.
 */
export function createOverviewRouter(uc: OverviewUseCases, viewerOf: (req: Request) => OverviewViewer): Router {
  const r = Router();
  r.get("/novo-rh/overview", async (req, res) => {
    const date = typeof req.query.date === "string" && req.query.date ? req.query.date : null;
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await uc.get(req.auth!.orgId, viewerOf(req), date));
    } catch (e) {
      if (e instanceof OverviewValidationError) throw problem(400, "validation_error", e.message, { field: "date" });
      throw e;
    }
  });
  // Só hoje (lista de Pessoas, Dashboard): o mesmo apuramento sem a semana — muito mais leve.
  r.get("/novo-rh/overview/today", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await uc.today(req.auth!.orgId, viewerOf(req)));
  });
  r.get("/novo-rh/overview/plan", async (req, res) => {
    const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : "");
    try {
      res.json(await uc.plan(req.auth!.orgId, viewerOf(req), q("from"), q("to")));
    } catch (e) {
      if (e instanceof OverviewValidationError) throw problem(400, "validation_error", e.message, { field: "from" });
      throw e;
    }
  });
  return r;
}
