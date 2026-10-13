import { Router, type Request } from "express";
import { log } from "../../../../infra/http/correlation.js";
import { problem } from "../../../../infra/http/problem-details.js";
import { DashboardForbiddenError, DashboardValidationError, type DashboardUseCases } from "../../application/use-cases/dashboard.use-cases.js";
import type { DashboardViewer } from "../../domain/ports/out/dashboard.ports.js";

const q = (req: Request, k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : "");

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DashboardValidationError) throw problem(400, "validation_error", e.message);
    if (e instanceof DashboardForbiddenError) throw problem(403, "forbidden", e.message);
    throw e;
  }
}

/**
 * Novo RH → Dashboard executivo (`hr.overview`; o layout é pessoal):
 * - `GET /novo-rh/dashboard/snapshot?locationId=` — agregado único dos widgets operacionais;
 * - `GET /novo-rh/dashboard/team?category&locationId&q&page` — lista de uma categoria (a pedido);
 * - `GET /novo-rh/dashboard/birthdays` — próximos aniversários (dia/mês; só com permissão);
 * - `GET|PUT|DELETE /novo-rh/dashboard/layout` — layout pessoal (metadados visuais).
 */
export function createDashboardRouter(uc: DashboardUseCases, viewerOf: (req: Request) => Promise<DashboardViewer>): Router {
  const r = Router();
  r.get("/novo-rh/dashboard/snapshot", async (req, res) => {
    const started = Date.now();
    const out = await run(async () => uc.snapshot(req.auth!.orgId, await viewerOf(req), q(req, "locationId") || null));
    const ms = Date.now() - started;
    const { cacheHits, timings, ...snapshot } = out;
    res.setHeader("Cache-Control", "no-store");
    // Tempo total e por fonte (visível no separador Rede do browser e no log).
    res.setHeader("Server-Timing", [`snapshot;dur=${ms}`, ...Object.entries(timings).map(([k, v]) => `${k};dur=${v}`), `cache;desc="hits ${cacheHits}/3"`].join(", "));
    log("info", "dashboard.snapshot", { ms, ...timings, cacheHits, context: snapshot.context.type, units: snapshot.locations.length, people: snapshot.team.total, partial: snapshot.partial });
    res.json(snapshot);
  });
  r.get("/novo-rh/dashboard/team", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await run(async () => uc.team(req.auth!.orgId, await viewerOf(req), { category: q(req, "category"), locationId: q(req, "locationId") || null, q: q(req, "q"), page: Number(q(req, "page")) || 1 })));
  });
  r.get("/novo-rh/dashboard/birthdays", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await run(async () => uc.birthdays(req.auth!.orgId, await viewerOf(req))));
  });
  r.get("/novo-rh/dashboard/layout", async (req, res) => res.json(await uc.layout(req.auth!.orgId, req.auth!.sub)));
  r.put("/novo-rh/dashboard/layout", async (req, res) => res.json(await run(() => uc.saveLayout(req.auth!.orgId, req.auth!.sub, req.body))));
  r.delete("/novo-rh/dashboard/layout", async (req, res) => res.json(await uc.resetLayout(req.auth!.orgId, req.auth!.sub)));
  return r;
}
