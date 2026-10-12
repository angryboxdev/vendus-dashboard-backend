import { Router } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import type { RemindersUseCases } from "../../application/use-cases/reminders.use-cases.js";

/** `POST /api/novo-rh/reminders/run` (`governance.settings`): verificar já os avisos devidos (o cron faz o mesmo de 10 em 10 min). */
export function createRemindersRouter(uc: RemindersUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const P = "/novo-rh/reminders/run";
  r.use(P, idempotency(store, { required: true }));
  r.post(P, async (req, res) => res.json(await uc.run(req.auth!.orgId)));
  return r;
}
