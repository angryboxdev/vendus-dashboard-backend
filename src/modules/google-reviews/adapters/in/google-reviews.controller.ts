import { Router, type Request } from "express";
import { log } from "../../../../infra/http/correlation.js";
import { problem } from "../../../../infra/http/problem-details.js";
import { GoogleReviewsError, type GoogleReviewsUseCases } from "../../application/use-cases/google-reviews.use-cases.js";

const STATUS = { not_configured: 409, validation: 400, not_found: 404 } as const;
const actor = (req: Request) => req.auth!.email || req.auth!.sub;

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GoogleReviewsError) throw problem(STATUS[e.code], e.code, e.message);
    // Falha do Google: 502 com mensagem curta (sem a chave).
    log("warn", "google_reviews.failed", { message: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    throw problem(502, "google_unavailable", "O Google não respondeu agora. Tente mais tarde.");
  }
}

/**
 * Novo RH → Avaliações Google:
 * - `GET /novo-rh/google-reviews` — nota por local ligado (`hr.overview`);
 * - `GET /novo-rh/google-reviews/locations/:id/reviews` — avaliações (a pedido);
 * - `GET /novo-rh/google-reviews/search?q=` e `PUT|DELETE /novo-rh/google-reviews/locations/:id` — ligar locais (`company.locations` MANAGE).
 */
export function createGoogleReviewsRouter(uc: GoogleReviewsUseCases): Router {
  const r = Router();
  const B = "/novo-rh/google-reviews";
  r.get(B, async (req, res) => res.json(await run(() => uc.overview(req.auth!.orgId))));
  r.get(`${B}/search`, async (req, res) => res.json(await run(() => uc.search(typeof req.query.q === "string" ? req.query.q : ""))));
  r.get(`${B}/locations/:id/reviews`, async (req, res) => res.json(await run(() => uc.reviews(req.auth!.orgId, String(req.params.id)))));
  r.put(`${B}/locations/:id`, async (req, res) => {
    const b = (req.body ?? {}) as { placeId?: unknown; placeName?: unknown };
    res.json(await run(() => uc.link(req.auth!.orgId, actor(req), String(req.params.id), { placeId: String(b.placeId ?? ""), placeName: String(b.placeName ?? "") })));
  });
  r.delete(`${B}/locations/:id`, async (req, res) => res.json(await run(() => uc.unlink(req.auth!.orgId, actor(req), String(req.params.id)))));
  return r;
}
