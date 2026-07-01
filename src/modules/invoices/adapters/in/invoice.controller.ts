import { Router } from "express";
import multer from "multer";
import type {
  CreateInvoicePort,
  UpdateInvoicePort,
  MarkInvoicePaidPort,
  SetInvoiceStatusPort,
  AddInvoiceLinePort,
  ClassifyInvoiceLinePort,
  ListInvoicesPort,
  ListInvoiceLinesPort,
  GetInvoicePort,
  DeleteInvoicePort,
  SuggestLineClassificationPort,
  ImportInvoicePort,
  ConfirmImportedInvoicePort,
  GetInvoiceAlertsPort,
  ProcessDirectDebitsPort,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceStatus, InvoiceLineType } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError, InvoiceAlreadyCancelledError, DuplicateInvoiceError } from "../../domain/errors.js";

interface InvoicePorts {
  createInvoice: CreateInvoicePort;
  updateInvoice: UpdateInvoicePort;
  markInvoicePaid: MarkInvoicePaidPort;
  setInvoiceStatus: SetInvoiceStatusPort;
  addInvoiceLine: AddInvoiceLinePort;
  classifyInvoiceLine: ClassifyInvoiceLinePort;
  listInvoices: ListInvoicesPort;
  listInvoiceLines: ListInvoiceLinesPort;
  getInvoice: GetInvoicePort;
  deleteInvoice: DeleteInvoicePort;
  suggestLineClassification: SuggestLineClassificationPort;
  importInvoice: ImportInvoicePort;
  confirmImportedInvoice: ConfirmImportedInvoicePort;
  getInvoiceAlerts: GetInvoiceAlertsPort;
  processDirectDebits: ProcessDirectDebitsPort;
}

function handleError(res: import("express").Response, err: unknown): void {
  if (err instanceof InvoiceNotFoundError || err instanceof InvoiceLineNotFoundError) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
  if (err instanceof InvoiceAlreadyCancelledError || err instanceof DuplicateInvoiceError) {
    res.status(409).json({ error: (err as Error).message });
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de ficheiro não suportado. Use PDF, JPG ou PNG."));
    }
  },
});

export function createInvoiceRouter(ports: InvoicePorts): Router {
  const router = Router();

  // GET /invoices/lines — all invoice lines (for CC analytics)
  router.get("/invoices/lines", async (_req, res) => {
    try {
      const lines = await ports.listInvoiceLines.execute();
      res.json(lines);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices
  router.get("/invoices", async (req, res) => {
    try {
      const { supplierId, costCenterId, status, from, to, isDirectDebit } = req.query as Record<string, string | undefined>;
      const filter: Parameters<typeof ports.listInvoices.execute>[0] = {};
      if (supplierId !== undefined) filter.supplierId = supplierId;
      if (costCenterId !== undefined) filter.costCenterId = costCenterId;
      if (status !== undefined) filter.status = status as InvoiceStatus;
      if (from !== undefined) filter.from = from;
      if (to !== undefined) filter.to = to;
      if (isDirectDebit !== undefined) filter.isDirectDebit = isDirectDebit === "true";
      const invoices = await ports.listInvoices.execute(filter);
      res.json(invoices);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/:id
  router.get("/invoices/:id", async (req, res) => {
    try {
      const invoice = await ports.getInvoice.execute(req.params.id);
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices
  router.post("/invoices", async (req, res) => {
    try {
      const invoice = await ports.createInvoice.execute(req.body as Parameters<CreateInvoicePort["execute"]>[0]);
      res.status(201).json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:id
  router.patch("/invoices/:id", async (req, res) => {
    try {
      const invoice = await ports.updateInvoice.execute({ ...req.body as object, id: req.params.id });
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:id/paid
  router.patch("/invoices/:id/paid", async (req, res) => {
    try {
      const { paidAt } = req.body as { paidAt?: string };
      const paidCmd: Parameters<typeof ports.markInvoicePaid.execute>[0] = { id: req.params.id };
      if (paidAt !== undefined) paidCmd.paidAt = paidAt;
      const invoice = await ports.markInvoicePaid.execute(paidCmd);
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:id/status
  router.patch("/invoices/:id/status", async (req, res) => {
    try {
      const { status } = req.body as { status: InvoiceStatus };
      const invoice = await ports.setInvoiceStatus.execute({ id: req.params.id, status });
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /invoices/:id
  router.delete("/invoices/:id", async (req, res) => {
    try {
      await ports.deleteInvoice.execute(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices/:invoiceId/lines
  router.post("/invoices/:invoiceId/lines", async (req, res) => {
    try {
      const body = req.body as {
        description: string;
        type?: InvoiceLineType;
        costCenterCategoryId?: string | null;
        category?: string | null;
        quantity: number;
        unit?: string | null;
        unitCostWithoutVat: number;
        vatRate: number;
        vatAmount: number;
        totalWithVat: number;
      };
      const line = await ports.addInvoiceLine.execute({
        invoiceId: req.params.invoiceId,
        ...body,
      });
      res.status(201).json(line);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:invoiceId/lines/:lineId/classify
  router.patch("/invoices/:invoiceId/lines/:lineId/classify", async (req, res) => {
    try {
      const { classify, saveAsRule } = req.body as {
        classify: { type?: InvoiceLineType; costCenterCategoryId?: string | null; stockItemId?: string | null };
        saveAsRule?: boolean;
      };
      const classifyCmd: Parameters<typeof ports.classifyInvoiceLine.execute>[0] = {
        invoiceId: req.params.invoiceId,
        lineId: req.params.lineId,
        classify,
      };
      if (saveAsRule !== undefined) classifyCmd.saveAsRule = saveAsRule;
      const line = await ports.classifyInvoiceLine.execute(classifyCmd);
      res.json(line);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/suggest-classification/:supplierId
  router.get("/invoices/suggest-classification/:supplierId", async (req, res) => {
    try {
      const result = await ports.suggestLineClassification.execute(req.params.supplierId);
      res.json(result ?? null);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/alerts
  router.get("/invoices/alerts", async (_req, res) => {
    try {
      const alerts = await ports.getInvoiceAlerts.execute();
      res.json(alerts);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices/import — multipart upload (field: "file")
  router.post("/invoices/import", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded. Use multipart field 'file'." });
        return;
      }
      const result = await ports.importInvoice.execute({
        fileBuffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices/:id/confirm
  router.post("/invoices/:id/confirm", async (req, res) => {
    try {
      const invoice = await ports.confirmImportedInvoice.execute({
        ...(req.body as object),
        id: req.params.id,
      });
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices/process-direct-debits — processa débitos diretos vencidos
  router.post("/invoices/process-direct-debits", async (_req, res) => {
    try {
      const result = await ports.processDirectDebits.execute();
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}
