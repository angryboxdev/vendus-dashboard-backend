import { Router } from "express";
import multer from "multer";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import type {
  AllocationCommand,
  CreateInvoicePort,
  UpdateInvoicePort,
  MarkInvoicePaidPort,
  SetInvoiceStatusPort,
  AddInvoiceLinePort,
  ClassifyInvoiceLinePort,
  UpdateInvoiceLinePort,
  DeleteInvoiceLinePort,
  ListInvoicesPort,
  ListInvoiceLinesPort,
  GetInvoicePort,
  DeleteInvoicePort,
  SuggestLineClassificationPort,
  ImportInvoicePort,
  ConfirmImportedInvoicePort,
  GetInvoiceAlertsPort,
  ProcessDirectDebitsPort,
  SetLineDetailModePort,
  SetInvoiceLineDeductibilityOverridePort,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceStatus, InvoiceLineType, LineDetailMode } from "../../domain/entities/invoice.js";
import {
  InvoiceNotFoundError,
  InvoiceLineNotFoundError,
  InvoiceAlreadyCancelledError,
  DuplicateInvoiceError,
  FiscalIdentityConflictError,
  InvoicePayableSettledError,
  InvoiceVersionConflictError,
  StockDecisionRequiredError,
  AllocationsNotReconciledError,
  InvoiceNotDraftError,
  InvoiceAmountsNotReconciledError,
  LineDetailModeError,
  LinesTotalMismatchError,
  InvoiceLinesLockedByAppliedStockReviewError,
  StockReviewRemovalConfirmationRequiredError,
} from "../../domain/errors.js";

interface InvoicePorts {
  /** Relatório de integridade: faturas com mais de uma conta a pagar ativa. */
  listPayableDuplicates: { execute(org: import("../../../../kernel/organization-id.js").OrganizationId): Promise<unknown> };
  /** «Enviar para Stock» sugerido (F2 §2.1). */
  suggestStockRouting: import("../../domain/ports/out/stock-routing.port.js").StockRoutingPort;
  /** F2 §2.2: feed «Por valores», guardar rascunho, repartição de fatura lançada. */
  listInvoiceAllocations: { execute(org: import("../../../../kernel/organization-id.js").OrganizationId): Promise<unknown> };
  saveInvoiceDraft: { execute(c: Parameters<ConfirmImportedInvoicePort["execute"]>[0]): Promise<unknown> };
  replaceInvoiceAllocations: { execute(c: { organizationId: import("../../../../kernel/organization-id.js").OrganizationId; id: string; allocations: AllocationCommand[]; expectedVersion?: number; actor?: string; reason?: string }): Promise<unknown> };
  /** F2 §2.3: «Total a pagar | Em atraso» (saldo aberto do razão). */
  getPayablesSummary: { execute(org: import("../../../../kernel/organization-id.js").OrganizationId, filter: { search?: string; from?: string; to?: string; supplierId?: string; locationId?: string; currency?: string }): Promise<unknown> };
  createInvoice: CreateInvoicePort;
  updateInvoice: UpdateInvoicePort;
  markInvoicePaid: MarkInvoicePaidPort;
  setInvoiceStatus: SetInvoiceStatusPort;
  setLineDetailMode: SetLineDetailModePort;
  addInvoiceLine: AddInvoiceLinePort;
  classifyInvoiceLine: ClassifyInvoiceLinePort;
  setInvoiceLineDeductibilityOverride: SetInvoiceLineDeductibilityOverridePort;
  updateInvoiceLine: UpdateInvoiceLinePort;
  deleteInvoiceLine: DeleteInvoiceLinePort;
  listInvoices: ListInvoicesPort;
  listInvoiceLines: ListInvoiceLinesPort;
  getInvoice: GetInvoicePort;
  deleteInvoice: DeleteInvoicePort;
  suggestLineClassification: SuggestLineClassificationPort;
  importInvoice: ImportInvoicePort;
  /** Documentos de cobrança AT/SS: lidos antes do import de faturas (sem IA, sem gravar nada). */
  readPaymentDocument?: import("../../domain/ports/in/payment-document.ports.js").ReadPaymentDocumentPort;
  confirmImportedInvoice: ConfirmImportedInvoicePort;
  getInvoiceAlerts: GetInvoiceAlertsPort;
  processDirectDebits: ProcessDirectDebitsPort;
}

function handleError(res: import("express").Response, err: unknown): void {
  if (err instanceof InvoiceNotFoundError || err instanceof InvoiceLineNotFoundError) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
  if (err instanceof InvoiceAlreadyCancelledError || err instanceof DuplicateInvoiceError || err instanceof InvoiceLinesLockedByAppliedStockReviewError) {
    res.status(409).json({ error: (err as Error).message });
    return;
  }
  if (err instanceof InvoiceAmountsNotReconciledError) {
    res.status(422).json({ error: err.message, code: "amounts_not_reconciled", ...err.details });
    return;
  }
  if (err instanceof AllocationsNotReconciledError) {
    res.status(422).json({ error: err.message, code: "allocations_not_reconciled", ...err.details });
    return;
  }
  if (err instanceof InvoiceNotDraftError) {
    res.status(409).json({ error: err.message, code: "not_draft" });
    return;
  }
  if (err instanceof StockDecisionRequiredError) {
    res.status(422).json({ error: err.message, code: `stock_${err.code}` });
    return;
  }
  if (err instanceof InvoiceVersionConflictError) {
    res.status(409).json({ error: err.message, code: "version_conflict", currentVersion: err.currentVersion });
    return;
  }
  if (err instanceof InvoicePayableSettledError) {
    res.status(409).json({ error: err.message, code: "payable_settled" });
    return;
  }
  if (err instanceof FiscalIdentityConflictError) {
    res.status(409).json({ error: err.message, code: err.code, ...err.details });
    return;
  }
  if (err instanceof StockReviewRemovalConfirmationRequiredError) {
    res.status(409).json({ error: err.message, requiresConfirmation: true });
    return;
  }
  if (err instanceof LineDetailModeError || err instanceof LinesTotalMismatchError) {
    res.status(422).json({ error: (err as Error).message });
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

export function createInvoiceRouter(ports: InvoicePorts, idempotencyStore: IdempotencyStore): Router {
  const router = Router();
  // Idempotency-Key opcional nas escritas que criam/finalizam documentos (F1 §1.4): o mesmo pedido
  // repetido (duplo clique, retry de rede) devolve a resposta guardada e não volta a executar.
  const idem = idempotency(idempotencyStore);
  router.post("/invoices", idem);
  router.post("/invoices/import", idem);
  router.post("/invoices/:id/confirm", idem);

  // GET /invoices/payables-summary — Total a pagar | Em atraso (respeita pesquisa, período, fornecedor, loja, moeda).
  router.get("/invoices/payables-summary", async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const pick = (k: string) => (typeof q[k] === "string" && q[k]!.trim() ? q[k]!.trim() : undefined);
      const filter: { search?: string; from?: string; to?: string; supplierId?: string; locationId?: string; currency?: string } = {};
      for (const k of ["search", "from", "to", "supplierId", "locationId", "currency"] as const) {
        const v = pick(k);
        if (v !== undefined) filter[k] = v;
      }
      res.json(await ports.getPayablesSummary.execute(req.auth!.orgId, filter));
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/allocations — repartições «Por valores» (análise por CC, montantes líquidos).
  router.get("/invoices/allocations", async (req, res) => {
    try {
      res.json(await ports.listInvoiceAllocations.execute(req.auth!.orgId));
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices/:id/draft — «Guardar rascunho»: grava sem lançar (sem obrigação nem revisão de Stock).
  router.post("/invoices/:id/draft", async (req, res) => {
    try {
      res.json(await ports.saveInvoiceDraft.execute({ ...(req.body as object), organizationId: req.auth!.orgId, id: req.params.id, actor: req.auth!.email || req.auth!.sub }));
    } catch (err) {
      handleError(res, err);
    }
  });

  // PUT /invoices/:id/allocations — repartição «Por valores» de uma fatura lançada (soma = base líquida).
  router.put("/invoices/:id/allocations", async (req, res) => {
    try {
      const b = (req.body ?? {}) as { allocations?: AllocationCommand[]; expectedVersion?: number; reason?: string };
      res.json(
        await ports.replaceInvoiceAllocations.execute({
          organizationId: req.auth!.orgId,
          id: req.params.id,
          allocations: Array.isArray(b.allocations) ? b.allocations : [],
          ...(typeof b.expectedVersion === "number" && { expectedVersion: b.expectedVersion }),
          ...(typeof b.reason === "string" && { reason: b.reason }),
          actor: req.auth!.email || req.auth!.sub,
        }),
      );
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices/stock-routing-suggestion — «Enviar para Stock» sugerido + motivo (F2 §2.1).
  router.post("/invoices/stock-routing-suggestion", async (req, res) => {
    try {
      const b = (req.body ?? {}) as { supplierId?: string | null; locationId?: string | null; categoryIds?: unknown };
      const categoryIds = Array.isArray(b.categoryIds) ? b.categoryIds.filter((c): c is string => typeof c === "string") : [];
      res.json(await ports.suggestStockRouting.suggest(req.auth!.orgId, { supplierId: b.supplierId ?? null, locationId: b.locationId ?? null, categoryIds }));
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/lines — all invoice lines (for CC analytics)
  router.get("/invoices/lines", async (req, res) => {
    try {
      const lines = await ports.listInvoiceLines.execute(req.auth!.orgId);
      res.json(lines);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices
  router.get("/invoices", async (req, res) => {
    try {
      const { supplierId, costCenterId, status, reconciliationStatus, from, to, isDirectDebit, documentType, search } = req.query as Record<string, string | undefined>;
      const filter: Parameters<typeof ports.listInvoices.execute>[1] = {};
      if (supplierId !== undefined) filter.supplierId = supplierId;
      if (costCenterId !== undefined) filter.costCenterId = costCenterId;
      if (status !== undefined) filter.status = status as InvoiceStatus;
      if (reconciliationStatus !== undefined) filter.reconciliationStatus = reconciliationStatus as import("../../domain/entities/invoice.js").ReconciliationStatus;
      if (from !== undefined) filter.from = from;
      if (to !== undefined) filter.to = to;
      if (isDirectDebit !== undefined) filter.isDirectDebit = isDirectDebit === "true";
      if (documentType !== undefined) filter.documentType = documentType as import("../../domain/entities/invoice.js").InvoiceDocumentType;
      if (search !== undefined) filter.search = search;
      const invoices = await ports.listInvoices.execute(req.auth!.orgId, filter);
      res.json(invoices);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/:id
  router.get("/invoices/:id", async (req, res) => {
    try {
      const invoice = await ports.getInvoice.execute(req.auth!.orgId, req.params.id);
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices
  router.post("/invoices", async (req, res) => {
    try {
      const invoice = await ports.createInvoice.execute({
        ...(req.body as object),
        organizationId: req.auth!.orgId,
        actor: req.auth!.email || req.auth!.sub,
      } as Parameters<CreateInvoicePort["execute"]>[0]);
      res.status(201).json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:id
  router.patch("/invoices/:id", async (req, res) => {
    try {
      const invoice = await ports.updateInvoice.execute({
        ...req.body as object,
        organizationId: req.auth!.orgId,
        id: req.params.id,
        actor: req.auth!.email,
      });
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:id/paid
  router.patch("/invoices/:id/paid", async (req, res) => {
    try {
      const { paidAt, bankAccountId, paymentMethod, paymentNotes } = req.body as { paidAt?: string; bankAccountId?: string | null; paymentMethod?: string | null; paymentNotes?: string | null };
      const paidCmd: Parameters<typeof ports.markInvoicePaid.execute>[0] = {
        organizationId: req.auth!.orgId,
        id: req.params.id,
      };
      if (paidAt !== undefined) paidCmd.paidAt = paidAt;
      if (bankAccountId !== undefined) paidCmd.bankAccountId = bankAccountId;
      if (paymentMethod !== undefined) paidCmd.paymentMethod = paymentMethod;
      if (paymentNotes !== undefined) paidCmd.paymentNotes = paymentNotes;
      const invoice = await ports.markInvoicePaid.execute(paidCmd);
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:id/line-detail-mode
  router.patch("/invoices/:id/line-detail-mode", async (req, res) => {
    try {
      const { mode, confirmRemoveStockReview } = req.body as { mode: LineDetailMode; confirmRemoveStockReview?: boolean };
      const cmd: Parameters<typeof ports.setLineDetailMode.execute>[0] = {
        organizationId: req.auth!.orgId,
        id: req.params.id,
        mode,
        actor: req.auth!.email,
      };
      if (confirmRemoveStockReview !== undefined) cmd.confirmRemoveStockReview = confirmRemoveStockReview;
      const invoice = await ports.setLineDetailMode.execute(cmd);
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:id/status
  router.patch("/invoices/:id/status", async (req, res) => {
    try {
      const { status } = req.body as { status: InvoiceStatus };
      const invoice = await ports.setInvoiceStatus.execute({ organizationId: req.auth!.orgId, id: req.params.id, status });
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /invoices/:id
  router.delete("/invoices/:id", async (req, res) => {
    try {
      const confirmRemoveStockReview = req.query.confirmRemoveStockReview === "true";
      await ports.deleteInvoice.execute({
        organizationId: req.auth!.orgId,
        id: req.params.id,
        confirmRemoveStockReview,
        actor: req.auth!.email,
        ...(typeof req.query.reason === "string" && { reason: req.query.reason }),
      });
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
        locationId?: string | null;
      };
      const line = await ports.addInvoiceLine.execute({
        organizationId: req.auth!.orgId,
        invoiceId: req.params.invoiceId,
        ...body,
      });
      res.status(201).json(line);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:invoiceId/lines/:lineId — edit line values
  router.patch("/invoices/:invoiceId/lines/:lineId", async (req, res) => {
    try {
      const { description, quantity, unit, unitCostWithoutVat, vatRate, vatAmount, totalWithVat, locationId } =
        req.body as {
          description?: string;
          quantity?: number;
          unit?: string | null;
          unitCostWithoutVat?: number;
          vatRate?: number;
          vatAmount?: number;
          totalWithVat?: number;
          locationId?: string | null;
        };
      const cmd: Parameters<typeof ports.updateInvoiceLine.execute>[0] = {
        organizationId: req.auth!.orgId,
        invoiceId: req.params.invoiceId,
        lineId: req.params.lineId,
      };
      if (description !== undefined) cmd.description = description;
      if (quantity !== undefined) cmd.quantity = quantity;
      if (unit !== undefined) cmd.unit = unit;
      if (unitCostWithoutVat !== undefined) cmd.unitCostWithoutVat = unitCostWithoutVat;
      if (vatRate !== undefined) cmd.vatRate = vatRate;
      if (vatAmount !== undefined) cmd.vatAmount = vatAmount;
      if (totalWithVat !== undefined) cmd.totalWithVat = totalWithVat;
      if (locationId !== undefined) cmd.locationId = locationId;
      const line = await ports.updateInvoiceLine.execute(cmd);
      res.json(line);
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /invoices/:invoiceId/lines/:lineId
  router.delete("/invoices/:invoiceId/lines/:lineId", async (req, res) => {
    try {
      await ports.deleteInvoiceLine.execute(req.auth!.orgId, req.params.invoiceId, req.params.lineId);
      res.status(204).send();
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /invoices/:invoiceId/lines/:lineId/classify
  router.patch("/invoices/:invoiceId/lines/:lineId/classify", async (req, res) => {
    try {
      const { classify, saveAsRule } = req.body as {
        classify: { type?: InvoiceLineType; costCenterCategoryId?: string | null; stockItemId?: string | null; channelId?: string | null };
        saveAsRule?: boolean;
      };
      const classifyCmd: Parameters<typeof ports.classifyInvoiceLine.execute>[0] = {
        organizationId: req.auth!.orgId,
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

  // PATCH /invoices/:invoiceId/lines/:lineId/deductibility — módulo Contabilidade
  router.patch("/invoices/:invoiceId/lines/:lineId/deductibility", async (req, res) => {
    try {
      const { deductiblePercentage, deductibilityOverrideReason } = req.body as {
        deductiblePercentage: number | null;
        deductibilityOverrideReason: string | null;
      };
      const line = await ports.setInvoiceLineDeductibilityOverride.execute({
        organizationId: req.auth!.orgId,
        invoiceId: req.params.invoiceId,
        lineId: req.params.lineId,
        deductiblePercentage,
        deductibilityOverrideReason,
      });
      res.json(line);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/suggest-classification/:supplierId?description=...
  router.get("/invoices/suggest-classification/:supplierId", async (req, res) => {
    try {
      const { description } = req.query as { description?: string };
      const result = await ports.suggestLineClassification.execute(req.auth!.orgId, req.params.supplierId, description);
      res.json(result ?? null);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /invoices/alerts
  router.get("/invoices/integrity/payable-duplicates", async (req, res) => {
    try {
      res.json(await ports.listPayableDuplicates.execute(req.auth!.orgId));
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get("/invoices/alerts", async (req, res) => {
    try {
      const alerts = await ports.getInvoiceAlerts.execute(req.auth!.orgId);
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
      const { documentType, treatAsInvoice } = req.body as { documentType?: string; treatAsInvoice?: string };
      // Documento de cobrança (AT/SS)? Devolve a leitura para revisão e não cria fatura.
      // `treatAsInvoice=true` mantém o fluxo antigo à escolha do utilizador.
      if (ports.readPaymentDocument && treatAsInvoice !== "true") {
        const payment = await ports.readPaymentDocument.execute(req.auth!.orgId, { buffer: req.file.buffer, mimeType: req.file.mimetype }).catch(() => null);
        if (payment) {
          res.status(200).json(payment);
          return;
        }
      }
      const cmd: Parameters<typeof ports.importInvoice.execute>[0] = {
        organizationId: req.auth!.orgId,
        fileBuffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      };
      if (documentType === "invoice" || documentType === "credit_note") cmd.documentType = documentType;
      const result = await ports.importInvoice.execute(cmd);
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
        organizationId: req.auth!.orgId,
        id: req.params.id,
        actor: req.auth!.email || req.auth!.sub,
      });
      res.json(invoice);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /invoices/process-direct-debits — processa débitos diretos vencidos
  router.post("/invoices/process-direct-debits", async (req, res) => {
    try {
      const result = await ports.processDirectDebits.execute(req.auth!.orgId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}
