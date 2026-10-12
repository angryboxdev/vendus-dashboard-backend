import { Router, type Request } from "express";
import { problem } from "../../../../infra/http/problem-details.js";
import { OverviewValidationError, type OverviewUseCases, type OverviewViewer } from "../../application/use-cases/overview.use-cases.js";

/** `GET /api/novo-rh/overview?date=AAAA-MM-DD` (`hr.overview`) — painel do dia, só leitura. */
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
  return r;
}
