import { Router } from "express";
import multer from "multer";
import {
  CsvStatementParser,
  ParseError,
  type ParsedStatement,
} from "../out/csv-statement-parser.adapter.js";
import type { PreviewStatementAccountPort, ReadStatementPdfPort } from "../../domain/ports/in/statement-pdf.ports.js";
import { statementAccountHints } from "../../domain/services/statement-pdf/statement-account-hints.js";
import type { ParsedBankStatement } from "../../domain/services/statement-pdf/parsed-statement.js";
import type { StatementSourceType } from "../../domain/entities/bank-statement-import.js";
import { XlsxStatementParser } from "../out/xlsx-statement-parser.adapter.js";
import {
  StatementNotFoundError,
  MovementNotFoundError,
  RuleNotFoundError,
  InvalidRuleError,
  StatementAlreadyClosedError,
  StatementBalanceDifferenceError,
  BlockingMovementsError,
  EntityAlreadyReconciledError,
  DuplicateMovementError,
  StaleDocumentBalanceError,
  StatementPdfNotRecognizedError,
} from "../../domain/errors.js";
import type { ImportBankStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { ListBankStatementsPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { GetBankStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { ReconcileMovementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { ClassifyMovementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { ApplyAutoRulesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { SuggestMatchesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { CreateReconciliationRulePort } from "../../domain/ports/in/bank-statement.ports.js";
import type { ListReconciliationRulesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { DeleteReconciliationRulePort } from "../../domain/ports/in/bank-statement.ports.js";
import type { UpdateReconciliationRulePort } from "../../domain/ports/in/bank-statement.ports.js";

type RuleOptionalFields = {
  amountCents?: number | null;
  amountToleranceCents?: number;
  supplierId?: string | null;
  vatRate?: number | null;
  vatIncluded?: boolean | null;
};

/**
 * Campos opcionais de um «movimento recorrente» (valor fixo, fornecedor, IVA). Devolve a mensagem de erro
 * (400) ou só os campos presentes no corpo (null = limpar).
 */
function parseRuleFields(body: Record<string, unknown>): string | RuleOptionalFields {
  const out: RuleOptionalFields = {};
  const isCents = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (body.amountCents !== undefined) {
    if (body.amountCents !== null && !isCents(body.amountCents)) return "amountCents must be a non-negative integer or null";
    out.amountCents = body.amountCents as number | null;
  }
  if (body.amountToleranceCents !== undefined) {
    if (!isCents(body.amountToleranceCents)) return "amountToleranceCents must be a non-negative integer";
    out.amountToleranceCents = body.amountToleranceCents as number;
  }
  if (body.supplierId !== undefined) {
    if (body.supplierId !== null && typeof body.supplierId !== "string") return "supplierId must be a string or null";
    out.supplierId = body.supplierId as string | null;
  }
  if (body.vatRate !== undefined) {
    if (body.vatRate !== null && (typeof body.vatRate !== "number" || body.vatRate < 0 || body.vatRate > 100)) {
      return "vatRate must be between 0 and 100 or null";
    }
    out.vatRate = body.vatRate as number | null;
  }
  if (body.vatIncluded !== undefined) {
    if (body.vatIncluded !== null && typeof body.vatIncluded !== "boolean") return "vatIncluded must be a boolean or null";
    out.vatIncluded = body.vatIncluded as boolean | null;
  }
  return out;
}
import type { CloseStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { DeleteBankStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { UpdateStatementBalancesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { FindMovementCandidatesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { UploadMovementDocumentPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { LinkStatementToAccountPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { GetAccountCalendarPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { GetAccountMonthDetailPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { GetMovementsLinkedToInvoicePort } from "../../domain/ports/in/bank-statement.ports.js";
import type { GetInvoiceOpenBalancesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { UnreconcileMovementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { SearchOccurrenceCandidatesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { GetMonthlySuggestionsPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { GetGroupedSettlementSuggestionsPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { ConfirmGroupedSettlementPort } from "../../domain/ports/in/bank-statement.ports.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const csvParser = new CsvStatementParser();
const xlsxParser = new XlsxStatementParser();

export class BankStatementController {
  readonly router: Router;

  constructor(
    private readonly importStatement: ImportBankStatementPort,
    private readonly listStatements: ListBankStatementsPort,
    private readonly getStatement: GetBankStatementPort,
    private readonly reconcileMovement: ReconcileMovementPort,
    private readonly classifyMovement: ClassifyMovementPort,
    private readonly applyAutoRules: ApplyAutoRulesPort,
    private readonly suggestMatches: SuggestMatchesPort,
    private readonly createRule: CreateReconciliationRulePort,
    private readonly listRules: ListReconciliationRulesPort,
    private readonly deleteRule: DeleteReconciliationRulePort,
    private readonly closeStatement: CloseStatementPort,
    private readonly deleteStatement: DeleteBankStatementPort,
    private readonly updateBalances: UpdateStatementBalancesPort,
    private readonly findMovementCandidates: FindMovementCandidatesPort,
    private readonly uploadMovementDocument: UploadMovementDocumentPort,
    private readonly linkStatementToAccount: LinkStatementToAccountPort,
    private readonly getAccountCalendar: GetAccountCalendarPort,
    private readonly getAccountMonthDetail: GetAccountMonthDetailPort,
    private readonly getMovementsLinkedToInvoice: GetMovementsLinkedToInvoicePort,
    private readonly getInvoiceOpenBalances: GetInvoiceOpenBalancesPort,
    private readonly unreconcileMovement: UnreconcileMovementPort,
    private readonly searchOccurrenceCandidates: SearchOccurrenceCandidatesPort,
    private readonly getMonthlySuggestions: GetMonthlySuggestionsPort,
    private readonly getGroupedSettlementSuggestions: GetGroupedSettlementSuggestionsPort,
    private readonly confirmGroupedSettlement: ConfirmGroupedSettlementPort,
    /** V2 (F2): extratos em PDF de modelos reconhecidos (Millennium BCP). */
    private readonly readStatementPdf?: ReadStatementPdfPort,
    /** V2 (F3): para que conta vai o extrato (existente ou a criar), na pré-visualização. */
    private readonly previewStatementAccount?: PreviewStatementAccountPort,
    /** «Movimentos recorrentes»: alterar, pausar ou reativar uma regra. */
    private readonly updateRule?: UpdateReconciliationRulePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  /** Lê o ficheiro enviado pelo formato: PDF (modelo reconhecido), XLSX ou CSV. */
  private async readUpload(file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<{ parsed: ParsedStatement; sourceType: StatementSourceType; pdf: ParsedBankStatement | null }> {
    const name = file.originalname.toLowerCase();
    if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) {
      if (!this.readStatementPdf) throw new StatementPdfNotRecognizedError("A importação de extratos em PDF não está disponível.");
      const pdf = await this.readStatementPdf.execute(file.buffer);
      return { parsed: pdf, sourceType: "pdf", pdf };
    }
    const isXlsx = file.mimetype.includes("spreadsheet") || file.mimetype.includes("excel") || name.endsWith(".xlsx") || name.endsWith(".xls");
    return isXlsx ? { parsed: xlsxParser.parse(file.buffer), sourceType: "xlsx", pdf: null } : { parsed: csvParser.parse(file.buffer), sourceType: "csv", pdf: null };
  }

  private registerRoutes(): void {
    /**
     * POST /bank-statements/preview
     * Multipart: field "file" (CSV or XLSX).
     * Parses the file and returns detected metadata — no DB writes.
     */
    this.router.post(
      "/bank-statements/preview",
      upload.single("file"),
      async (req, res) => {
        try {
          if (!req.file) {
            res.status(400).json({ error: "file is required" });
            return;
          }
          const { parsed, pdf } = await this.readUpload(req.file);
          const sum = (type: "credit" | "debit") => parsed.movements.filter((m) => m.movementType === type).reduce((s, m) => s + m.amount, 0);

          res.json({
            bankName: parsed.bankName,
            accountNumber: parsed.accountNumber,
            openingBalance: parsed.openingBalance,   // cents | null
            closingBalance: parsed.closingBalance,   // cents | null
            periodStart: parsed.periodStart?.toISOString().slice(0, 10) ?? null,
            periodEnd: parsed.periodEnd?.toISOString().slice(0, 10) ?? null,
            movementsCount: parsed.movements.length,
            // V2: resumo para confirmar antes de gravar (o PDF traz mais metadados e a validação dos saldos).
            inflowCents: sum("credit"),
            outflowCents: sum("debit"),
            template: pdf?.template ?? null,
            iban: pdf?.iban ?? null,
            currency: pdf?.currency ?? null,
            statementNumber: pdf?.statementNumber ?? null,
            accountLabel: pdf?.accountLabel ?? null,
            issues: pdf?.issues ?? [],
            canImport: !(pdf?.issues ?? []).some((i) => i.blocking),
            // V2 (F3): conta existente ou banco/conta que vão ser criados ao importar.
            accountResolution: pdf && this.previewStatementAccount ? await this.previewStatementAccount.execute(req.auth!.orgId, pdf) : null,
          });
        } catch (e) {
          if (e instanceof ParseError || e instanceof StatementPdfNotRecognizedError) {
            res.status(422).json({ error: e.message });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      }
    );

    /**
     * POST /bank-statements
     * Multipart: field "file" (CSV) + optional body fields:
     *   bankName, accountNumber, openingBalance, closingBalance (overrides CSV values)
     */
    this.router.post(
      "/bank-statements",
      upload.single("file"),
      async (req, res) => {
        try {
          let parsed = { bankName: null, accountNumber: null, openingBalance: null, closingBalance: null, periodStart: null, periodEnd: null, movements: [] } as {
            bankName: string | null;
            accountNumber: string | null;
            openingBalance: number | null;
            closingBalance: number | null;
            periodStart: Date | null;
            periodEnd: Date | null;
            movements: import("../../domain/ports/in/bank-statement.ports.js").ParsedMovement[];
          };

          let sourceType: StatementSourceType = "manual";
          let pdfCurrency: string | null = null;
          let pdfStatement: ParsedBankStatement | null = null;
          if (req.file) {
            const read = await this.readUpload(req.file);
            parsed = read.parsed;
            sourceType = read.sourceType;
            pdfCurrency = read.pdf?.currency ?? null;
            pdfStatement = read.pdf;
            // Extrato em PDF que não fecha (saldos, movimentos ilegíveis): nunca se grava com valores errados.
            const blocking = (read.pdf?.issues ?? []).filter((i) => i.blocking);
            if (blocking.length > 0) {
              res.status(422).json({ error: `O extrato não pode ser importado: ${blocking.map((i) => i.message).join(" ")}`, issues: blocking });
              return;
            }
          }

          const body = req.body as Record<string, unknown>;

          const bankName = (body.bankName as string | undefined) ?? parsed.bankName;
          const accountNumber =
            (body.accountNumber as string | undefined) ?? parsed.accountNumber ?? pdfStatement?.iban ?? null;
          const openingBalance = body.openingBalance != null
            ? Math.round(Number(body.openingBalance))
            : parsed.openingBalance;
          const closingBalance = body.closingBalance != null
            ? Math.round(Number(body.closingBalance))
            : parsed.closingBalance;

          if (!bankName) {
            res.status(400).json({ error: "bankName is required (not detectable from CSV)" });
            return;
          }
          if (!accountNumber) {
            res.status(400).json({ error: "accountNumber is required (not detectable from CSV)" });
            return;
          }
          if (openingBalance == null) {
            res.status(400).json({ error: "openingBalance is required (not detectable from CSV)" });
            return;
          }
          if (closingBalance == null) {
            res.status(400).json({ error: "closingBalance is required (not detectable from CSV)" });
            return;
          }

          const periodStart = body.periodStart
            ? new Date(body.periodStart as string)
            : (parsed.periodStart ?? new Date());
          const periodEnd = body.periodEnd
            ? new Date(body.periodEnd as string)
            : (parsed.periodEnd ?? new Date());

          const bankAccountId = body.bankAccountId as string | undefined | null;

          const result = await this.importStatement.execute({
            organizationId: req.auth!.orgId,
            bankAccountId: bankAccountId ?? null,
            bankName,
            accountNumber,
            periodStart,
            periodEnd,
            currency: (body.currency as string | undefined) ?? pdfCurrency ?? "EUR",
            sourceType,
            sourceFileName: req.file?.originalname ?? null,
            openingBalance,
            closingBalance,
            movements: parsed.movements,
            // PDF reconhecido sem conta escolhida: banco e conta encontrados ou criados pelo próprio extrato.
            ...(pdfStatement && !bankAccountId && { autoAccount: statementAccountHints(pdfStatement) }),
          });

          res.status(201).json(result);
        } catch (e) {
          if (e instanceof ParseError || e instanceof StatementPdfNotRecognizedError) {
            res.status(422).json({ error: e.message });
            return;
          }
          if (e instanceof DuplicateMovementError) {
            res.status(409).json({
              error: "Um ou mais movimentos deste extrato já existem (duplicados). Verifique se o ficheiro já tinha sido importado.",
            });
            return;
          }
          const msg = e instanceof Error ? e.message : "Internal error";
          res.status(500).json({ error: msg });
        }
      }
    );

    /**
     * GET /bank-statements
     * Query: accountNumber?, status?, from?, to?
     */
    this.router.get("/bank-statements", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const query: import("../../domain/ports/in/bank-statement.ports.js").ListBankStatementsQuery = {
          organizationId: req.auth!.orgId,
        };
        if (q.accountNumber) query.accountNumber = q.accountNumber;
        if (q.status) query.status = q.status as import("../../domain/entities/bank-statement-import.js").StatementStatus;
        if (q.from) query.from = new Date(q.from);
        if (q.to) query.to = new Date(q.to);
        const results = await this.listStatements.execute(query);
        res.json(results);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/:id
     * Query: reconciliationStatus?, movementType?, riskLevel?
     */
    this.router.get("/bank-statements/:id", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const movFilter: import("../../domain/ports/in/bank-statement.ports.js").GetBankStatementFilter = {};
        if (q.reconciliationStatus) movFilter.reconciliationStatus = q.reconciliationStatus as import("../../domain/entities/bank-movement.js").ReconciliationStatus;
        if (q.movementType) movFilter.movementType = q.movementType as import("../../domain/entities/bank-movement.js").MovementType;
        if (q.riskLevel) movFilter.riskLevel = q.riskLevel as import("../../domain/entities/bank-movement.js").RiskLevel;
        const detail = await this.getStatement.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"]!,
          filter: movFilter,
        });
        if (!detail) {
          res.status(404).json({ error: "Statement not found" });
          return;
        }
        res.json(detail);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-statements/:id/apply-rules
     */
    this.router.post("/bank-statements/:id/apply-rules", async (req, res) => {
      try {
        const result = await this.applyAutoRules.execute({
          organizationId: req.auth!.orgId,
          statementImportId: req.params["id"]!,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof StatementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-statements/:id/suggest
     */
    this.router.post("/bank-statements/:id/suggest", async (req, res) => {
      try {
        const suggestions = await this.suggestMatches.execute({
          organizationId: req.auth!.orgId,
          statementImportId: req.params["id"]!,
        });
        res.json(suggestions);
      } catch (e) {
        if (e instanceof StatementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-statements/:id/close
     */
    this.router.post("/bank-statements/:id/close", async (req, res) => {
      try {
        await this.closeStatement.execute({
          organizationId: req.auth!.orgId,
          statementImportId: req.params["id"]!,
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof StatementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (
          e instanceof StatementBalanceDifferenceError ||
          e instanceof BlockingMovementsError ||
          e instanceof StatementAlreadyClosedError
        ) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /bank-statements/:id/balances
     * Body: { openingBalance: number (cents), closingBalance: number (cents) }
     */
    this.router.patch("/bank-statements/:id/balances", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const opening = body.openingBalance != null ? Math.round(Number(body.openingBalance)) : null;
        const closing = body.closingBalance != null ? Math.round(Number(body.closingBalance)) : null;
        if (opening == null || closing == null) {
          res.status(400).json({ error: "openingBalance and closingBalance are required (cents)" });
          return;
        }
        await this.updateBalances.execute({
          organizationId: req.auth!.orgId,
          statementImportId: req.params["id"]!,
          openingBalance: opening,
          closingBalance: closing,
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof StatementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof StatementAlreadyClosedError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * DELETE /bank-statements/:id
     * Deletes the statement and all its movements (CASCADE in DB).
     */
    this.router.delete("/bank-statements/:id", async (req, res) => {
      try {
        await this.deleteStatement.execute({
          organizationId: req.auth!.orgId,
          statementImportId: req.params["id"]!,
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof StatementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /bank-statements/movements/:movId/reconcile
     * Body: { entityType: "invoice" | "payable_entry", entityId: string }
     */
    this.router.patch("/bank-statements/movements/:movId/reconcile", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!Array.isArray(body.entityLinks) || (body.entityLinks as unknown[]).length === 0) {
          res.status(400).json({ error: "entityLinks must be a non-empty array" });
          return;
        }
        let entityLinks: import("../../domain/ports/in/bank-statement.ports.js").EntityLinkInput[];
        try {
          entityLinks = (body.entityLinks as Record<string, unknown>[]).map((el) => {
          const allocatedAmountCents = Number(el["allocatedAmountCents"]);
          if (!Number.isFinite(allocatedAmountCents) || allocatedAmountCents <= 0) {
            throw new Error(`allocatedAmountCents must be a positive number (got ${el["allocatedAmountCents"]})`);
          }
          return {
            entityType: el["entityType"] as "invoice" | "payable_entry",
            entityId: el["entityId"] as string,
            allocatedAmountCents: Math.round(allocatedAmountCents),
            supplierId: typeof el["supplierId"] === "string" ? el["supplierId"] : null,
          };
        });
        } catch (parseErr) {
          res.status(400).json({ error: parseErr instanceof Error ? parseErr.message : "Invalid entityLinks" });
          return;
        }
        await this.reconcileMovement.execute({
          organizationId: req.auth!.orgId,
          movementId: req.params["movId"]!,
          entityLinks,
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof MovementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof EntityAlreadyReconciledError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * DELETE /bank-statements/movements/:movId/reconcile
     * Cancels reconciliation: removes all entity links and resets the movement status.
     */
    this.router.delete("/bank-statements/movements/:movId/reconcile", async (req, res) => {
      try {
        await this.unreconcileMovement.execute({
          organizationId: req.auth!.orgId,
          movementId: req.params["movId"]!,
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof MovementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /bank-statements/movements/:movId/classify
     * Body: { justificationType, matchedEntityType?, matchedEntityId?, riskLevel?, notes?, documentUrl? }
     */
    this.router.patch("/bank-statements/movements/:movId/classify", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!body.justificationType) {
          res.status(400).json({ error: "justificationType is required" });
          return;
        }
        const classifyCmd: import("../../domain/ports/in/bank-statement.ports.js").ClassifyMovementCommand = {
          organizationId: req.auth!.orgId,
          movementId: req.params["movId"]!,
          justificationType: body.justificationType as import("../../domain/entities/bank-movement.js").JustificationType,
        };
        if (body.matchedEntityType !== undefined) classifyCmd.matchedEntityType = body.matchedEntityType as import("../../domain/entities/bank-movement.js").MatchedEntityType;
        if (body.matchedEntityId !== undefined) classifyCmd.matchedEntityId = body.matchedEntityId as string;
        if (body.riskLevel !== undefined) classifyCmd.riskLevel = body.riskLevel as import("../../domain/entities/bank-movement.js").RiskLevel;
        if (body.notes !== undefined) classifyCmd.notes = body.notes as string;
        if (body.documentUrl !== undefined) classifyCmd.documentUrl = body.documentUrl as string;
        if (body.costCenterGroupId !== undefined) classifyCmd.costCenterGroupId = body.costCenterGroupId as string;
        if (body.costCenterCategoryId !== undefined) classifyCmd.costCenterCategoryId = body.costCenterCategoryId as string;
        if (body.supplierId !== undefined) classifyCmd.supplierId = body.supplierId as string;
        if (body.vatRate != null) classifyCmd.vatRate = Number(body.vatRate);
        if (body.vatIncluded != null) classifyCmd.vatIncluded = Boolean(body.vatIncluded);
        await this.classifyMovement.execute(classifyCmd);
        res.status(204).send();
      } catch (e) {
        if (e instanceof MovementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-statements/movements/:movId/document
     * Multipart: field "file" (PDF or image, max 10 MB).
     * Uploads to Supabase Storage and returns the public URL.
     * The URL should be sent in the subsequent classify request.
     */
    this.router.post(
      "/bank-statements/movements/:movId/document",
      upload.single("file"),
      async (req, res) => {
        try {
          if (!req.file) {
            res.status(400).json({ error: "file is required" });
            return;
          }
          const result = await this.uploadMovementDocument.execute({
            organizationId: req.auth!.orgId,
            movementId: req.params["movId"] as string,
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
          });
          res.status(201).json(result);
        } catch (e) {
          if (e instanceof MovementNotFoundError) {
            res.status(404).json({ error: e instanceof Error ? e.message : "Not found" });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      }
    );

    /**
     * GET /bank-statements/movements/:movId/candidates
     * Returns invoices and payable entries that can be linked to this movement,
     * scored by amount/date/name proximity. Read-only — nothing is persisted.
     */
    this.router.get("/bank-statements/movements/:movId/candidates", async (req, res) => {
      try {
        const candidates = await this.findMovementCandidates.execute({
          organizationId: req.auth!.orgId,
          movementId: req.params["movId"]!,
        });
        res.json(candidates);
      } catch (e) {
        if (e instanceof MovementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/movements/:movId/grouped-suggestions
     * "Liquidação agrupada" — read-only. Tries a simple 1:1 match first;
     * failing that, identifies the supplier (hint + existing candidate
     * scoring, no new learning) and searches exact-sum combinations of that
     * supplier's open invoices/credit notes. Nothing is persisted — applying
     * a suggestion or a manual multi-select goes through the
     * grouped-settlement confirm endpoint below.
     */
    this.router.get("/bank-statements/movements/:movId/grouped-suggestions", async (req, res) => {
      try {
        const result = await this.getGroupedSettlementSuggestions.execute({
          organizationId: req.auth!.orgId,
          movementId: req.params["movId"]!,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof MovementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-statements/movements/:movId/grouped-settlement
     * Body: { entityLinks: Array<{ entityId, documentType, allocatedAmountCents, expectedOpenBalanceCents }> }
     * Atomically settles the movement against N documents (invoices +
     * credit notes) — see ConfirmGroupedSettlementPort / the RPC behind it.
     * Idempotent: retrying with the same still-valid selection is safe.
     * Rejects (409) when any document's open balance changed since the
     * caller observed it (concurrent settlement elsewhere).
     */
    this.router.post("/bank-statements/movements/:movId/grouped-settlement", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!Array.isArray(body.entityLinks) || (body.entityLinks as unknown[]).length === 0) {
          res.status(400).json({ error: "entityLinks must be a non-empty array" });
          return;
        }
        let entityLinks: import("../../domain/ports/in/bank-statement.ports.js").GroupedEntityLinkInput[];
        try {
          entityLinks = (body.entityLinks as Record<string, unknown>[]).map((el) => {
            const allocatedAmountCents = Number(el["allocatedAmountCents"]);
            const expectedOpenBalanceCents = Number(el["expectedOpenBalanceCents"]);
            if (!Number.isFinite(allocatedAmountCents) || allocatedAmountCents === 0) {
              throw new Error(`allocatedAmountCents must be a non-zero number (got ${el["allocatedAmountCents"]})`);
            }
            if (!Number.isFinite(expectedOpenBalanceCents)) {
              throw new Error(`expectedOpenBalanceCents must be a number (got ${el["expectedOpenBalanceCents"]})`);
            }
            const documentType = el["documentType"];
            if (documentType !== "invoice" && documentType !== "credit_note") {
              throw new Error(`documentType must be "invoice" or "credit_note" (got ${documentType})`);
            }
            return {
              entityId: el["entityId"] as string,
              documentType,
              allocatedAmountCents: Math.round(allocatedAmountCents),
              expectedOpenBalanceCents: Math.round(expectedOpenBalanceCents),
            };
          });
        } catch (parseErr) {
          res.status(400).json({ error: parseErr instanceof Error ? parseErr.message : "Invalid entityLinks" });
          return;
        }
        const result = await this.confirmGroupedSettlement.execute({
          organizationId: req.auth!.orgId,
          movementId: req.params["movId"]!,
          entityLinks,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof MovementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof StaleDocumentBalanceError) {
          res.status(409).json({ error: e.message, entityIds: e.entityIds });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /bank-statements/:id/link-account
     * Body: { bankAccountId: string }
     * Manually links an import to a registered bank account (used when auto-link failed).
     */
    this.router.patch("/bank-statements/:id/link-account", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!body["bankAccountId"] || typeof body["bankAccountId"] !== "string") {
          res.status(400).json({ error: "bankAccountId is required" });
          return;
        }
        await this.linkStatementToAccount.execute({
          organizationId: req.auth!.orgId,
          statementImportId: req.params["id"]!,
          bankAccountId: body["bankAccountId"],
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof StatementNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof Error && e.message.startsWith("Bank account not found")) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/rules
     * Query: activeOnly?
     */
    this.router.get("/bank-statements/rules", async (req, res) => {
      try {
        const activeOnly = req.query["activeOnly"] === "true";
        const rules = await this.listRules.execute({ organizationId: req.auth!.orgId, activeOnly });
        res.json(rules);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-statements/rules
     */
    this.router.post("/bank-statements/rules", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!body.name || !body.descriptionContains || !body.justificationType) {
          res.status(400).json({
            error: "name, descriptionContains and justificationType are required",
          });
          return;
        }
        const fields = parseRuleFields(body);
        if (typeof fields === "string") {
          res.status(400).json({ error: fields });
          return;
        }
        const ruleCmd: import("../../domain/ports/in/bank-statement.ports.js").CreateReconciliationRuleCommand = {
          organizationId: req.auth!.orgId,
          name: body.name as string,
          descriptionContains: body.descriptionContains as string,
          justificationType: body.justificationType as import("../../domain/entities/bank-movement.js").JustificationType,
          movementType: (body.movementType as import("../../domain/entities/bank-movement.js").MovementType | undefined) ?? null,
          costCenterGroupId: (body.costCenterGroupId as string | undefined) ?? null,
          costCenterCategoryId: (body.costCenterCategoryId as string | undefined) ?? null,
          ...fields,
          ...(typeof body.bankAccountId === "string" && { bankAccountId: body.bankAccountId }),
          ...(body.applyToExisting === true && { applyToExisting: true }),
        };
        if (body.requiresDocument !== undefined) ruleCmd.requiresDocument = body.requiresDocument as boolean;
        if (body.affectsDre !== undefined) ruleCmd.affectsDre = body.affectsDre as boolean;
        if (body.affectsCashflow !== undefined) ruleCmd.affectsCashflow = body.affectsCashflow as boolean;
        if (body.affectsProfitability !== undefined) ruleCmd.affectsProfitability = body.affectsProfitability as boolean;
        if (body.riskLevel !== undefined) ruleCmd.riskLevel = body.riskLevel as import("../../domain/entities/bank-movement.js").RiskLevel;
        const rule = await this.createRule.execute(ruleCmd);
        res.status(201).json(rule);
      } catch (e) {
        if (e instanceof InvalidRuleError) {
          res.status(400).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /bank-statements/rules/:ruleId
     * Body: campos a alterar, isActive (pausar/reativar) e applyToExisting.
     */
    this.router.patch("/bank-statements/rules/:ruleId", async (req, res) => {
      if (!this.updateRule) {
        res.status(501).json({ error: "Not available" });
        return;
      }
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const fields = parseRuleFields(body);
        if (typeof fields === "string") {
          res.status(400).json({ error: fields });
          return;
        }
        if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
          res.status(400).json({ error: "isActive must be a boolean" });
          return;
        }
        const result = await this.updateRule.execute({
          organizationId: req.auth!.orgId,
          id: req.params["ruleId"]!,
          ...fields,
          ...(typeof body.name === "string" && { name: body.name }),
          ...(typeof body.descriptionContains === "string" && { descriptionContains: body.descriptionContains }),
          ...(typeof body.justificationType === "string" && {
            justificationType: body.justificationType as import("../../domain/entities/bank-movement.js").JustificationType,
          }),
          ...(body.costCenterGroupId !== undefined && { costCenterGroupId: (body.costCenterGroupId as string | null) ?? null }),
          ...(body.costCenterCategoryId !== undefined && { costCenterCategoryId: (body.costCenterCategoryId as string | null) ?? null }),
          ...(typeof body.isActive === "boolean" && { isActive: body.isActive }),
          ...(body.applyToExisting === true && { applyToExisting: true }),
        });
        res.json(result);
      } catch (e) {
        if (e instanceof RuleNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof InvalidRuleError) {
          res.status(400).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * DELETE /bank-statements/rules/:ruleId
     */
    this.router.delete("/bank-statements/rules/:ruleId", async (req, res) => {
      try {
        await this.deleteRule.execute({ organizationId: req.auth!.orgId, id: req.params["ruleId"]! });
        res.status(204).send();
      } catch (e) {
        if (e instanceof RuleNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/accounts/:accountId/calendar?year=YYYY
     * Returns AccountMonthStat[] for the given year (up to current month if current year).
     */
    this.router.get("/bank-statements/accounts/:accountId/calendar", async (req, res) => {
      try {
        const accountId = req.params["accountId"]!;
        const year = req.query["year"]
          ? parseInt(req.query["year"] as string, 10)
          : new Date().getFullYear();
        if (isNaN(year)) {
          res.status(400).json({ error: "year must be a valid integer" });
          return;
        }
        const result = await this.getAccountCalendar.execute({
          organizationId: req.auth!.orgId,
          bankAccountId: accountId,
          year,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/accounts/:accountId/calendar/:year/:month
     * Returns DaySlot[] for the given month (movements grouped by day).
     */
    this.router.get("/bank-statements/accounts/:accountId/calendar/:year/:month", async (req, res) => {
      try {
        const accountId = req.params["accountId"]!;
        const year = parseInt(req.params["year"]!, 10);
        const month = parseInt(req.params["month"]!, 10);
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          res.status(400).json({ error: "Invalid year or month" });
          return;
        }
        const result = await this.getAccountMonthDetail.execute({
          organizationId: req.auth!.orgId,
          bankAccountId: accountId,
          year,
          month,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/accounts/:accountId/calendar/:year/:month/suggestions
     * Returns suggestions for the pending movements of the given month: entity
     * (invoice/payable) matches and "repeat last month's classification" hints
     * for recurring descriptions. Read-only — applying a suggestion goes through
     * the regular reconcile/classify endpoints.
     */
    this.router.get("/bank-statements/accounts/:accountId/calendar/:year/:month/suggestions", async (req, res) => {
      try {
        const accountId = req.params["accountId"]!;
        const year = parseInt(req.params["year"]!, 10);
        const month = parseInt(req.params["month"]!, 10);
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          res.status(400).json({ error: "Invalid year or month" });
          return;
        }
        const result = await this.getMonthlySuggestions.execute({
          organizationId: req.auth!.orgId,
          bankAccountId: accountId,
          year,
          month,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/invoices/open-balances?ids=id1,id2,...
     * Returns the open balance (cents) for each invoice ID.
     */
    this.router.get("/bank-statements/invoices/open-balances", async (req, res) => {
      try {
        const raw = req.query["ids"];
        const ids = typeof raw === "string" && raw.length > 0 ? raw.split(",").filter(Boolean) : [];
        const result = await this.getInvoiceOpenBalances.execute({
          organizationId: req.auth!.orgId,
          invoiceIds: ids,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/invoices/:invoiceId/movements
     * Returns the bank movements linked (reconciled) to the given invoice.
     */
    this.router.get("/bank-statements/invoices/:invoiceId/movements", async (req, res) => {
      try {
        const invoiceId = req.params["invoiceId"]!;
        const result = await this.getMovementsLinkedToInvoice.execute({
          organizationId: req.auth!.orgId,
          invoiceId,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-statements/occurrences/candidates
     * Query: q? (text search on recurrence/supplier name), dateFrom?, dateTo?, limit?
     * Returns recurrence occurrences without an invoice that can be linked to a movement
     * when justification is "contrato_recorrencia".
     */
    this.router.get("/bank-statements/occurrences/candidates", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const searchQuery: import("../../domain/ports/in/bank-statement.ports.js").SearchOccurrenceCandidatesQuery = {
          organizationId: req.auth!.orgId,
        };
        if (q["q"]) searchQuery.q = q["q"];
        if (q["dateFrom"]) searchQuery.dateFrom = q["dateFrom"];
        if (q["dateTo"]) searchQuery.dateTo = q["dateTo"];
        if (q["referenceDate"]) searchQuery.referenceDate = q["referenceDate"];
        if (q["limit"]) searchQuery.limit = parseInt(q["limit"], 10);
        const result = await this.searchOccurrenceCandidates.execute(searchQuery);
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}
