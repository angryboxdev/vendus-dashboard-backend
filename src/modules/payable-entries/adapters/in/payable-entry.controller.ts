import { Router } from "express";
import type {
  CreatePayableEntryPort,
  UpdatePayableEntryPort,
  MarkPayableAsPaidPort,
  CancelPayableEntryPort,
  ListPayableEntriesPort,
  GetPayableEntryPort,
  DeletePayableEntryPort,
  GetPayableSummaryPort,
  GetPayableCalendarPort,
  ListPayableEntriesFilter,
} from "../../domain/ports/in/payable-entry.ports.js";
import type { PayableStatus } from "../../domain/entities/payable-entry.js";
import {
  PayableEntryNotFoundError,
  PayableEntryAlreadyPaidError,
  PayableEntryAlreadyCancelledError,
  PayableEntryCannotDeleteError,
  InvoiceForPayableNotFoundError,
} from "../../domain/errors.js";

interface PayableEntryPorts {
  createPayableEntry: CreatePayableEntryPort;
  updatePayableEntry: UpdatePayableEntryPort;
  markPayableAsPaid: MarkPayableAsPaidPort;
  cancelPayableEntry: CancelPayableEntryPort;
  listPayableEntries: ListPayableEntriesPort;
  getPayableEntry: GetPayableEntryPort;
  deletePayableEntry: DeletePayableEntryPort;
  getPayableSummary: GetPayableSummaryPort;
  getPayableCalendar: GetPayableCalendarPort;
}

function handleError(res: import("express").Response, err: unknown): void {
  if (
    err instanceof PayableEntryNotFoundError ||
    err instanceof InvoiceForPayableNotFoundError
  ) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
  if (
    err instanceof PayableEntryAlreadyPaidError ||
    err instanceof PayableEntryAlreadyCancelledError ||
    err instanceof PayableEntryCannotDeleteError
  ) {
    res.status(409).json({ error: (err as Error).message });
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}

export function createPayableEntryRouter(ports: PayableEntryPorts): Router {
  const router = Router();

  // GET /payable-entries/summary
  router.get("/payable-entries/summary", async (req, res) => {
    try {
      const filter = buildFilter(req.query as Record<string, string | undefined>);
      const summary = await ports.getPayableSummary.execute(filter);
      res.json(summary);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /payable-entries/calendar
  router.get("/payable-entries/calendar", async (req, res) => {
    try {
      const { from, to } = req.query as Record<string, string | undefined>;
      if (!from || !to) {
        res.status(400).json({ error: "Query params 'from' and 'to' are required (YYYY-MM-DD)" });
        return;
      }
      const days = await ports.getPayableCalendar.execute({ from, to });
      res.json(days);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /payable-entries
  router.get("/payable-entries", async (req, res) => {
    try {
      const filter = buildFilter(req.query as Record<string, string | undefined>);
      const entries = await ports.listPayableEntries.execute(filter);
      res.json(entries);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /payable-entries/:id
  router.get("/payable-entries/:id", async (req, res) => {
    try {
      const entry = await ports.getPayableEntry.execute(req.params.id);
      res.json(entry);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /payable-entries
  router.post("/payable-entries", async (req, res) => {
    try {
      const entry = await ports.createPayableEntry.execute(
        req.body as Parameters<CreatePayableEntryPort["execute"]>[0],
      );
      res.status(201).json(entry);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-entries/:id
  router.patch("/payable-entries/:id", async (req, res) => {
    try {
      const entry = await ports.updatePayableEntry.execute({
        ...(req.body as object),
        id: req.params.id,
      });
      res.json(entry);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-entries/:id/paid
  router.patch("/payable-entries/:id/paid", async (req, res) => {
    try {
      const { paidAt } = req.body as { paidAt?: string };
      const cmd: Parameters<MarkPayableAsPaidPort["execute"]>[0] = { id: req.params.id };
      if (paidAt !== undefined) cmd.paidAt = paidAt;
      const entry = await ports.markPayableAsPaid.execute(cmd);
      res.json(entry);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-entries/:id/cancel
  router.patch("/payable-entries/:id/cancel", async (req, res) => {
    try {
      const entry = await ports.cancelPayableEntry.execute(req.params.id);
      res.json(entry);
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /payable-entries/:id
  router.delete("/payable-entries/:id", async (req, res) => {
    try {
      await ports.deletePayableEntry.execute(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function buildFilter(q: Record<string, string | undefined>): ListPayableEntriesFilter {
  const filter: ListPayableEntriesFilter = {};
  if (q.supplierId) filter.supplierId = q.supplierId;
  if (q.costCenterId) filter.costCenterId = q.costCenterId;
  if (q.status) filter.status = q.status as PayableStatus;
  if (q.from) filter.from = q.from;
  if (q.to) filter.to = q.to;
  return filter;
}
