import { Router } from "express";
import multer from "multer";
import {
  AccountingDocumentNotFoundError,
  CancellationReasonRequiredError,
  DeductibilityOverrideReasonRequiredError,
  InvalidAccountingDocumentTypeError,
  InvalidDeductiblePercentageError,
  InvalidFundingSourceError,
  InvalidSettlementMethodError,
  InvalidVatPeriodError,
  InvalidVatPeriodicityError,
  PossibleDuplicateDocumentError,
} from "../../domain/errors.js";
import {
  ACCOUNTING_DOCUMENT_TYPES,
  ACCOUNTING_FUNDING_SOURCES,
  ACCOUNTING_SETTLEMENT_METHODS,
} from "../../domain/entities/accounting-document.js";
import type {
  CreateAccountingDocumentPort,
  UpdateAccountingDocumentPort,
  GetAccountingDocumentPort,
  ValidateAccountingDocumentPort,
  MarkAccountingDocumentPendencyPort,
  CancelAccountingDocumentPort,
  UploadAccountingDocumentAttachmentPort,
  UpdateAccountingDocumentCommand,
} from "../../domain/ports/in/accounting-document.ports.js";
import type { ListAccountingDocumentsPort } from "../../domain/ports/in/accounting-documents.ports.js";
import type { GetVatOverviewPort } from "../../domain/ports/in/vat-overview.ports.js";
import type { GetAccountingSettingsPort, UpdateAccountingSettingsPort } from "../../domain/ports/in/accounting-settings.ports.js";

function handleError(e: unknown, res: import("express").Response): void {
  if (e instanceof AccountingDocumentNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  if (e instanceof PossibleDuplicateDocumentError) {
    res.status(409).json({ error: e.message, candidate: e.candidate });
    return;
  }
  if (
    e instanceof InvalidAccountingDocumentTypeError ||
    e instanceof InvalidFundingSourceError ||
    e instanceof InvalidSettlementMethodError ||
    e instanceof InvalidDeductiblePercentageError ||
    e instanceof DeductibilityOverrideReasonRequiredError ||
    e instanceof CancellationReasonRequiredError ||
    e instanceof InvalidVatPeriodError ||
    e instanceof InvalidVatPeriodicityError
  ) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de ficheiro não suportado. Use PDF, JPG ou PNG."));
  },
});

export class AccountingController {
  readonly router: Router;

  constructor(
    private readonly createAccountingDocument: CreateAccountingDocumentPort,
    private readonly updateAccountingDocument: UpdateAccountingDocumentPort,
    private readonly getAccountingDocument: GetAccountingDocumentPort,
    private readonly validateAccountingDocument: ValidateAccountingDocumentPort,
    private readonly markAccountingDocumentPendency: MarkAccountingDocumentPendencyPort,
    private readonly cancelAccountingDocument: CancelAccountingDocumentPort,
    private readonly uploadAccountingDocumentAttachment: UploadAccountingDocumentAttachmentPort,
    private readonly listAccountingDocuments: ListAccountingDocumentsPort,
    private readonly getVatOverview: GetVatOverviewPort,
    private readonly getAccountingSettings: GetAccountingSettingsPort,
    private readonly updateAccountingSettings: UpdateAccountingSettingsPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // ── Documentos (vista agregada) ───────────────────────────────────────────

    this.router.get("/accounting/documents", async (req, res) => {
      try {
        const { from, to } = req.query as Record<string, string | undefined>;
        const result = await this.listAccountingDocuments.execute({
          organizationId: req.auth!.orgId,
          ...(from !== undefined && { from }),
          ...(to !== undefined && { to }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/accounting/documents/:id", async (req, res) => {
      try {
        const result = await this.getAccountingDocument.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/accounting/documents", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!ACCOUNTING_DOCUMENT_TYPES.includes(body.documentType as (typeof ACCOUNTING_DOCUMENT_TYPES)[number])) {
          res.status(400).json({ error: "documentType inválido" });
          return;
        }
        if (!ACCOUNTING_FUNDING_SOURCES.includes(body.fundingSource as (typeof ACCOUNTING_FUNDING_SOURCES)[number])) {
          res.status(400).json({ error: "fundingSource inválido" });
          return;
        }
        if (typeof body.entityName !== "string" || body.entityName.trim().length === 0) {
          res.status(400).json({ error: "entityName é obrigatório" });
          return;
        }
        if (typeof body.issueDate !== "string") {
          res.status(400).json({ error: "issueDate é obrigatório" });
          return;
        }
        if (!ACCOUNTING_SETTLEMENT_METHODS.includes(body.settlementMethod as (typeof ACCOUNTING_SETTLEMENT_METHODS)[number])) {
          res.status(400).json({ error: "settlementMethod inválido" });
          return;
        }
        const result = await this.createAccountingDocument.execute({
          organizationId: req.auth!.orgId,
          documentType: body.documentType as string,
          fundingSource: body.fundingSource as string,
          entityName: body.entityName,
          nif: (body.nif as string | null | undefined) ?? null,
          documentNumber: (body.documentNumber as string | null | undefined) ?? null,
          issueDate: body.issueDate,
          receivedDate: (body.receivedDate as string | null | undefined) ?? null,
          competenceDate: (body.competenceDate as string | null | undefined) ?? null,
          ...(body.currency !== undefined && { currency: body.currency as string }),
          ...(body.country !== undefined && { country: body.country as string }),
          subtotalWithoutVat: Number(body.subtotalWithoutVat),
          vatAmount: Number(body.vatAmount),
          totalWithVat: Number(body.totalWithVat),
          costCenterCategoryId: (body.costCenterCategoryId as string | null | undefined) ?? null,
          deductiblePercentage: (body.deductiblePercentage as number | null | undefined) ?? null,
          deductibilityOverrideReason: (body.deductibilityOverrideReason as string | null | undefined) ?? null,
          settlementMethod: body.settlementMethod as string,
          notes: (body.notes as string | null | undefined) ?? null,
          actor: req.auth!.email,
          confirmDuplicate: body.confirmDuplicate === true,
        });
        res.status(201).json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.patch("/accounting/documents/:id", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (body.documentType !== undefined && !ACCOUNTING_DOCUMENT_TYPES.includes(body.documentType as (typeof ACCOUNTING_DOCUMENT_TYPES)[number])) {
          res.status(400).json({ error: "documentType inválido" });
          return;
        }
        if (body.fundingSource !== undefined && !ACCOUNTING_FUNDING_SOURCES.includes(body.fundingSource as (typeof ACCOUNTING_FUNDING_SOURCES)[number])) {
          res.status(400).json({ error: "fundingSource inválido" });
          return;
        }
        if (body.settlementMethod !== undefined && !ACCOUNTING_SETTLEMENT_METHODS.includes(body.settlementMethod as (typeof ACCOUNTING_SETTLEMENT_METHODS)[number])) {
          res.status(400).json({ error: "settlementMethod inválido" });
          return;
        }
        const data: UpdateAccountingDocumentCommand["data"] = {};
        if (body.documentType !== undefined) data.documentType = body.documentType as string;
        if (body.fundingSource !== undefined) data.fundingSource = body.fundingSource as string;
        if (body.entityName !== undefined) data.entityName = body.entityName as string;
        if ("nif" in body) data.nif = (body.nif as string | null) ?? null;
        if ("documentNumber" in body) data.documentNumber = (body.documentNumber as string | null) ?? null;
        if (body.issueDate !== undefined) data.issueDate = body.issueDate as string;
        if ("receivedDate" in body) data.receivedDate = (body.receivedDate as string | null) ?? null;
        if ("competenceDate" in body) data.competenceDate = (body.competenceDate as string | null) ?? null;
        if (body.currency !== undefined) data.currency = body.currency as string;
        if (body.country !== undefined) data.country = body.country as string;
        if (body.subtotalWithoutVat !== undefined) data.subtotalWithoutVat = Number(body.subtotalWithoutVat);
        if (body.vatAmount !== undefined) data.vatAmount = Number(body.vatAmount);
        if (body.totalWithVat !== undefined) data.totalWithVat = Number(body.totalWithVat);
        if ("costCenterCategoryId" in body) data.costCenterCategoryId = (body.costCenterCategoryId as string | null) ?? null;
        if ("deductiblePercentage" in body) data.deductiblePercentage = (body.deductiblePercentage as number | null) ?? null;
        if ("deductibilityOverrideReason" in body) data.deductibilityOverrideReason = (body.deductibilityOverrideReason as string | null) ?? null;
        if (body.settlementMethod !== undefined) data.settlementMethod = body.settlementMethod as string;
        if ("notes" in body) data.notes = (body.notes as string | null) ?? null;

        const result = await this.updateAccountingDocument.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          data,
          actor: req.auth!.email,
          confirmDuplicate: body.confirmDuplicate === true,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/accounting/documents/:id/validate", async (req, res) => {
      try {
        const result = await this.validateAccountingDocument.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/accounting/documents/:id/mark-pendency", async (req, res) => {
      try {
        const result = await this.markAccountingDocumentPendency.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/accounting/documents/:id/cancel", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
          res.status(400).json({ error: "reason é obrigatório" });
          return;
        }
        const result = await this.cancelAccountingDocument.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          reason: body.reason,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/accounting/documents/:id/attachment", upload.single("file"), async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "Ficheiro em falta" });
          return;
        }
        const result = await this.uploadAccountingDocumentAttachment.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    // ── Apuramento de IVA ──────────────────────────────────────────────────────

    this.router.get("/accounting/vat-overview", async (req, res) => {
      try {
        const { year, period } = req.query as Record<string, string | undefined>;
        const result = await this.getVatOverview.execute({
          organizationId: req.auth!.orgId,
          year: Number(year),
          period: Number(period),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    // ── Configurações ──────────────────────────────────────────────────────────

    this.router.get("/accounting/settings", async (req, res) => {
      try {
        const result = await this.getAccountingSettings.execute({ organizationId: req.auth!.orgId });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.patch("/accounting/settings", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.updateAccountingSettings.execute({
          organizationId: req.auth!.orgId,
          vatPeriodicity: body.vatPeriodicity as string,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
