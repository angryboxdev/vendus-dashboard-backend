import { Router } from "express";
import multer from "multer";
import type {
  CreateRecurrencePort,
  UpdateRecurrencePort,
  PauseRecurrencePort,
  ResumeRecurrencePort,
  CloseRecurrencePort,
  ListRecurrencesPort,
  GetRecurrencePort,
} from "../../domain/ports/in/recurrence.ports.js";
import type {
  GenerateOccurrencePort,
  ListOccurrencesPort,
  GetOccurrencePort,
  LinkInvoiceToOccurrencePort,
  MarkOccurrenceAsPaidPort,
  CancelOccurrencePort,
  GetLinkedInvoiceIdsPort,
  GetRecurrenceSummaryPort,
} from "../../domain/ports/in/occurrence.ports.js";
import type { GenerateBatchOccurrencesPort } from "../../domain/ports/in/batch.ports.js";
import type { UploadRecurrenceDocumentUseCase } from "../../application/use-cases/upload-recurrence-document.use-case.js";
import type { DeleteRecurrenceDocumentUseCase } from "../../application/use-cases/delete-recurrence-document.use-case.js";
import type { UploadOccurrenceDocumentUseCase } from "../../application/use-cases/upload-occurrence-document.use-case.js";
import type { DeleteOccurrenceDocumentUseCase } from "../../application/use-cases/delete-occurrence-document.use-case.js";
import type { RecurrenceType, RecurrenceStatus } from "../../domain/entities/recurrence.js";
import type { OccurrenceStatus } from "../../domain/entities/recurrence-occurrence.js";
import {
  RecurrenceNotFoundError,
  RecurrenceClosedError,
  RecurrenceAlreadyPausedError,
  RecurrenceNotPausedError,
  OccurrenceNotFoundError,
  OccurrenceAlreadyExistsError,
  OccurrenceInvalidTransitionError,
  OccurrenceInvoiceRequiredError,
  InvoiceAlreadyLinkedError,
} from "../../domain/errors.js";

interface RecurrencePorts {
  createRecurrence: CreateRecurrencePort;
  updateRecurrence: UpdateRecurrencePort;
  pauseRecurrence: PauseRecurrencePort;
  resumeRecurrence: ResumeRecurrencePort;
  closeRecurrence: CloseRecurrencePort;
  listRecurrences: ListRecurrencesPort;
  getRecurrence: GetRecurrencePort;
  generateOccurrence: GenerateOccurrencePort;
  listOccurrences: ListOccurrencesPort;
  getOccurrence: GetOccurrencePort;
  linkInvoiceToOccurrence: LinkInvoiceToOccurrencePort;
  markOccurrenceAsPaid: MarkOccurrenceAsPaidPort;
  cancelOccurrence: CancelOccurrencePort;
  getLinkedInvoiceIds: GetLinkedInvoiceIdsPort;
  generateBatch: GenerateBatchOccurrencesPort;
  uploadRecurrenceDocument: UploadRecurrenceDocumentUseCase;
  deleteRecurrenceDocument: DeleteRecurrenceDocumentUseCase;
  uploadOccurrenceDocument: UploadOccurrenceDocumentUseCase;
  deleteOccurrenceDocument: DeleteOccurrenceDocumentUseCase;
  getRecurrenceSummary: GetRecurrenceSummaryPort;
}

const upload = multer({ storage: multer.memoryStorage() });

function handleError(res: import("express").Response, err: unknown): void {
  if (err instanceof RecurrenceNotFoundError || err instanceof OccurrenceNotFoundError) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
  if (
    err instanceof RecurrenceClosedError ||
    err instanceof RecurrenceAlreadyPausedError ||
    err instanceof RecurrenceNotPausedError ||
    err instanceof OccurrenceAlreadyExistsError ||
    err instanceof OccurrenceInvalidTransitionError ||
    err instanceof OccurrenceInvoiceRequiredError ||
    err instanceof InvoiceAlreadyLinkedError
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

export function createRecurrenceRouter(ports: RecurrencePorts): Router {
  const router = Router();

  // ── Occurrence routes (specific paths must come before /:id) ────────────────

  // GET /payable-recurrences/occurrences/linked-invoice-ids
  router.get("/payable-recurrences/occurrences/linked-invoice-ids", async (_req, res) => {
    try {
      const ids = await ports.getLinkedInvoiceIds.execute();
      res.json(ids);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /payable-recurrences/occurrences/by-invoice/:invoiceId
  router.get("/payable-recurrences/occurrences/by-invoice/:invoiceId", async (req, res) => {
    try {
      const filter: import("../../domain/ports/out/occurrence-repository.port.js").OccurrenceFilter = {
        invoiceId: req.params.invoiceId,
      };
      const occs = await ports.listOccurrences.execute(filter);
      if (occs.length === 0) {
        res.status(404).json(null);
        return;
      }
      const occ = occs[0];
      const rec = await ports.getRecurrence.execute(occ.recurrenceId);
      res.json({ occurrence: occ, recurrenceName: rec.name });
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /payable-recurrences/occurrences/:occId
  router.get("/payable-recurrences/occurrences/:occId", async (req, res) => {
    try {
      const occ = await ports.getOccurrence.execute(req.params.occId);
      res.json(occ);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-recurrences/occurrences/:occId/pay
  router.patch("/payable-recurrences/occurrences/:occId/pay", async (req, res) => {
    try {
      const { paidAt, paymentMethod, paymentBankAccountId, paymentNotes } = req.body as {
        paidAt?: string;
        paymentMethod?: string;
        paymentBankAccountId?: string;
        paymentNotes?: string;
      };
      const cmd: Parameters<MarkOccurrenceAsPaidPort["execute"]>[0] = {
        occurrenceId: req.params.occId,
      };
      if (paidAt !== undefined) cmd.paidAt = paidAt;
      if (paymentMethod !== undefined) {
        cmd.paymentMethod = paymentMethod as import("../../domain/entities/recurrence-occurrence.js").OccurrencePaymentMethod;
      }
      if (paymentBankAccountId !== undefined) cmd.paymentBankAccountId = paymentBankAccountId;
      if (paymentNotes !== undefined) cmd.paymentNotes = paymentNotes;
      const occ = await ports.markOccurrenceAsPaid.execute(cmd);
      res.json(occ);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-recurrences/occurrences/:occId/link-invoice
  router.patch("/payable-recurrences/occurrences/:occId/link-invoice", async (req, res) => {
    try {
      const { invoiceId } = req.body as { invoiceId: string };
      const occ = await ports.linkInvoiceToOccurrence.execute({
        occurrenceId: req.params.occId,
        invoiceId,
      });
      res.json(occ);
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /payable-recurrences/occurrences/:occId
  router.delete("/payable-recurrences/occurrences/:occId", async (req, res) => {
    try {
      await ports.cancelOccurrence.execute(req.params.occId);
      res.status(204).send();
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Recurrence collection routes ────────────────────────────────────────────

  // GET /payable-recurrences/summary  (must be before /:id)
  router.get("/payable-recurrences/summary", async (_req, res) => {
    try {
      const summary = await ports.getRecurrenceSummary.execute();
      res.json(summary);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /payable-recurrences
  router.get("/payable-recurrences", async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const filter: import("../../domain/ports/out/recurrence-repository.port.js").RecurrenceFilter = {};
      if (q.status) filter.status = q.status as RecurrenceStatus;
      if (q.type) filter.type = q.type as RecurrenceType;
      if (q.supplierId) filter.supplierId = q.supplierId;
      const recurrences = await ports.listRecurrences.execute(filter);
      res.json(recurrences);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /payable-recurrences
  router.post("/payable-recurrences", async (req, res) => {
    try {
      const rec = await ports.createRecurrence.execute(
        req.body as Parameters<CreateRecurrencePort["execute"]>[0],
      );
      res.status(201).json(rec);
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Recurrence item routes ──────────────────────────────────────────────────

  // GET /payable-recurrences/:id
  router.get("/payable-recurrences/:id", async (req, res) => {
    try {
      const rec = await ports.getRecurrence.execute(req.params.id);
      res.json(rec);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-recurrences/:id
  router.patch("/payable-recurrences/:id", async (req, res) => {
    try {
      const rec = await ports.updateRecurrence.execute({
        ...(req.body as object),
        id: req.params.id,
      });
      res.json(rec);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-recurrences/:id/pause
  router.patch("/payable-recurrences/:id/pause", async (req, res) => {
    try {
      const rec = await ports.pauseRecurrence.execute(req.params.id);
      res.json(rec);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-recurrences/:id/resume
  router.patch("/payable-recurrences/:id/resume", async (req, res) => {
    try {
      const rec = await ports.resumeRecurrence.execute(req.params.id);
      res.json(rec);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /payable-recurrences/:id/close
  router.patch("/payable-recurrences/:id/close", async (req, res) => {
    try {
      const rec = await ports.closeRecurrence.execute(req.params.id);
      res.json(rec);
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Occurrence sub-routes ───────────────────────────────────────────────────

  // GET /payable-recurrences/:id/occurrences
  router.get("/payable-recurrences/:id/occurrences", async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const filter: import("../../domain/ports/out/occurrence-repository.port.js").OccurrenceFilter = {
        recurrenceId: req.params.id,
      };
      if (q.period) filter.period = q.period;
      if (q.status) filter.status = q.status as OccurrenceStatus;
      const occs = await ports.listOccurrences.execute(filter);
      res.json(occs);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /payable-recurrences/:id/occurrences/generate
  router.post("/payable-recurrences/:id/occurrences/generate", async (req, res) => {
    try {
      const { year, month } = req.body as { year: number; month: number };
      const occ = await ports.generateOccurrence.execute({
        recurrenceId: req.params.id,
        year: Number(year),
        month: Number(month),
      });
      res.status(201).json(occ);
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Document upload routes ───────────────────────────────────────────────────

  // POST /payable-recurrences/:id/document
  router.post("/payable-recurrences/:id/document", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded. Use multipart field 'file'." });
        return;
      }
      const result = await ports.uploadRecurrenceDocument.execute({
        recurrenceId: req.params.id,
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /payable-recurrences/:id/document
  router.delete("/payable-recurrences/:id/document", async (req, res) => {
    try {
      const result = await ports.deleteRecurrenceDocument.execute(req.params.id);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /payable-recurrences/occurrences/:occId/document
  router.post("/payable-recurrences/occurrences/:occId/document", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded. Use multipart field 'file'." });
        return;
      }
      const result = await ports.uploadOccurrenceDocument.execute({
        occurrenceId: req.params.occId,
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /payable-recurrences/occurrences/:occId/document
  router.delete("/payable-recurrences/occurrences/:occId/document", async (req, res) => {
    try {
      const result = await ports.deleteOccurrenceDocument.execute(req.params.occId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Batch route ──────────────────────────────────────────────────────────────

  // POST /payable-recurrences/batch/generate
  router.post("/payable-recurrences/batch/generate", async (req, res) => {
    try {
      const { year, month } = req.body as { year: number; month: number };
      const result = await ports.generateBatch.execute({
        year: Number(year),
        month: Number(month),
      });
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}
