import { Router } from "express";
import type {
  ListObligationsPort,
  CreateManualObligationPort,
  MarkObligationAsPaidPort,
  ListObligationsFilter,
} from "../../domain/ports/in/obligation.ports.js";
import type { ObligationSource, ObligationStatus, PaymentMethod } from "../../domain/entities/financial-obligation.js";
import { ObligationNotFoundError } from "../../domain/errors.js";

interface ObligationPorts {
  listObligations: ListObligationsPort;
  createManualObligation: CreateManualObligationPort;
  markObligationAsPaid: MarkObligationAsPaidPort;
}

function handleError(res: import("express").Response, err: unknown): void {
  if (err instanceof ObligationNotFoundError) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}

export function createFinancialObligationRouter(ports: ObligationPorts): Router {
  const router = Router();

  // GET /financial-obligations
  router.get("/financial-obligations", async (req, res) => {
    try {
      const filter = buildFilter(req.query as Record<string, string | undefined>);
      const obligations = await ports.listObligations.execute(filter);
      res.json(obligations);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /financial-obligations
  router.post("/financial-obligations", async (req, res) => {
    try {
      const obligation = await ports.createManualObligation.execute(
        req.body as Parameters<CreateManualObligationPort["execute"]>[0],
      );
      res.status(201).json(obligation);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /financial-obligations/:id/pay
  router.patch("/financial-obligations/:id/pay", async (req, res) => {
    try {
      const { paidAt, paymentMethod } = req.body as {
        paidAt?: string;
        paymentMethod?: PaymentMethod;
      };
      const cmd: Parameters<MarkObligationAsPaidPort["execute"]>[0] = { id: req.params.id };
      if (paidAt !== undefined) cmd.paidAt = paidAt;
      if (paymentMethod !== undefined) cmd.paymentMethod = paymentMethod;
      const obligation = await ports.markObligationAsPaid.execute(cmd);
      res.json(obligation);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function buildFilter(q: Record<string, string | undefined>): ListObligationsFilter {
  const filter: ListObligationsFilter = {};
  if (q.from) filter.from = q.from;
  if (q.to) filter.to = q.to;
  if (q.supplierId) filter.supplierId = q.supplierId;
  if (q.status) filter.status = q.status as ObligationStatus;
  if (q.source) filter.source = q.source as ObligationSource;
  return filter;
}
