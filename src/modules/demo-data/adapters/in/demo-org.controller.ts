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
/** Tempo máximo à espera da atualização antes de responder 202 (continua em segundo plano). */
const REFRESH_WAIT_MS = 15_000;

export function createDemoOrgRouter(uc: DemoOrgUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const P = "/novo-rh/demo";
  r.get(P, async (req, res) => res.json(await uc.status(req.auth!.orgId)));
  // Idempotency-Key só na criação. O /refresh é idempotente por natureza (marcações com id
  // fixo; o enriquecimento só cria o que falta; uma atualização de cada vez), e um pedido
  // repetido pela rede dava 409 "ainda a ser processado".
  r.post(P, idempotency(store, { required: true }), async (req, res) => {
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
      // Pode demorar (marcações, fecho do mês, alertas): responde em até 15 s; senão 202 e continua em segundo plano.
      const job = uc.refresh(req.auth!.orgId, { userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub }, { force: true });
      job.catch(() => undefined);
      const quick = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), REFRESH_WAIT_MS))]);
      if (quick === null) res.status(202).json({ skipped: false, running: true, punches: 0, scenario: false });
      else res.json(quick);
    } catch (e) {
      if (e instanceof DemoOrgError) throw problem(STATUS[e.code], e.code, e.message);
      throw e;
    }
  });
  return r;
}
