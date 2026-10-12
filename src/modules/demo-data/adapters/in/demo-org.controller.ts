import { Router } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { DemoOrgUseCases } from "../../application/use-cases/demo-org.use-cases.js";
import { DemoOrgError } from "../../domain/entities/demo-org.js";

const STATUS: Record<DemoOrgError["code"], number> = { already_exists: 409, not_found: 404, is_demo: 409, admin_only: 403 };

/**
 * `/api/novo-rh/demo` — sempre na organização real (o middleware de modo
 * Demonstração não toca nesta rota): estado e criação da organização fictícia.
 */
export function createDemoOrgRouter(uc: DemoOrgUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const P = "/novo-rh/demo";
  r.use(P, idempotency(store, { required: true }));
  r.use(`${P}/refresh`, idempotency(store, { required: true }));
  r.get(P, async (req, res) => res.json(await uc.status(req.auth!.orgId)));
  r.post(P, async (req, res) => {
    try {
      const out = await uc.create(req.auth!.orgId, { userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub, isAdmin: !!req.access?.isAdmin });
      res.status(201).json({ exists: true, name: out.demo.name, summary: out.summary });
    } catch (e) {
      if (e instanceof DemoOrgError) throw problem(STATUS[e.code], e.code, e.message);
      throw e;
    }
  });
  // Atualizar já os dados fictícios (marcações até agora; cenário se faltar). Só Admin.
  r.post(`${P}/refresh`, async (req, res) => {
    if (!req.access?.isAdmin) throw problem(403, "admin_only", "Só um Admin pode atualizar a demonstração.");
    try {
      res.json(await uc.refresh(req.auth!.orgId, { userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub }, { force: true }));
    } catch (e) {
      if (e instanceof DemoOrgError) throw problem(STATUS[e.code], e.code, e.message);
      throw e;
    }
  });
  return r;
}
