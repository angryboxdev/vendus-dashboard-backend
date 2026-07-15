import { Router } from "express";
import multer from "multer";
import {
  CsvStatementParser,
  ParseError,
} from "../out/csv-statement-parser.adapter.js";
import { XlsxStatementParser } from "../out/xlsx-statement-parser.adapter.js";
import {
  StatementNotFoundError,
  MovementNotFoundError,
  RuleNotFoundError,
  StatementAlreadyClosedError,
  StatementBalanceDifferenceError,
  BlockingMovementsError,
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
import type { CloseStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { DeleteBankStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { UpdateStatementBalancesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { FindMovementCandidatesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { UploadMovementDocumentPort } from "../../domain/ports/in/bank-statement.ports.js";

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
    private readonly uploadMovementDocument: UploadMovementDocumentPort
  ) {
    this.router = Router();
    this.registerRoutes();
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
      (req, res) => {
        try {
          if (!req.file) {
            res.status(400).json({ error: "file is required" });
            return;
          }
          const isXlsx =
            req.file.mimetype.includes("spreadsheet") ||
            req.file.mimetype.includes("excel") ||
            req.file.originalname.toLowerCase().endsWith(".xlsx") ||
            req.file.originalname.toLowerCase().endsWith(".xls");
          const parsed = isXlsx
            ? xlsxParser.parse(req.file.buffer)
            : csvParser.parse(req.file.buffer);

          res.json({
            bankName: parsed.bankName,
            accountNumber: parsed.accountNumber,
            openingBalance: parsed.openingBalance,   // cents | null
            closingBalance: parsed.closingBalance,   // cents | null
            periodStart: parsed.periodStart?.toISOString().slice(0, 10) ?? null,
            periodEnd: parsed.periodEnd?.toISOString().slice(0, 10) ?? null,
            movementsCount: parsed.movements.length,
          });
        } catch (e) {
          if (e instanceof ParseError) {
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

          if (req.file) {
            const isXlsx =
              req.file.mimetype.includes("spreadsheet") ||
              req.file.mimetype.includes("excel") ||
              req.file.originalname.toLowerCase().endsWith(".xlsx") ||
              req.file.originalname.toLowerCase().endsWith(".xls");
            parsed = isXlsx
              ? xlsxParser.parse(req.file.buffer)
              : csvParser.parse(req.file.buffer);
          }

          const body = req.body as Record<string, unknown>;

          const bankName = (body.bankName as string | undefined) ?? parsed.bankName;
          const accountNumber =
            (body.accountNumber as string | undefined) ?? parsed.accountNumber;
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

          const result = await this.importStatement.execute({
            bankName,
            accountNumber,
            periodStart,
            periodEnd,
            currency: (body.currency as string | undefined) ?? "EUR",
            sourceType: req.file
              ? (req.file.mimetype.includes("spreadsheet") ||
                 req.file.mimetype.includes("excel") ||
                 req.file.originalname.toLowerCase().endsWith(".xlsx") ||
                 req.file.originalname.toLowerCase().endsWith(".xls")
                  ? "xlsx"
                  : "csv")
              : "manual",
            sourceFileName: req.file?.originalname ?? null,
            openingBalance,
            closingBalance,
            movements: parsed.movements,
          });

          res.status(201).json(result);
        } catch (e) {
          if (e instanceof ParseError) {
            res.status(422).json({ error: e.message });
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
        const results = await this.listStatements.execute({
          accountNumber: q.accountNumber,
          status: q.status as import("../../domain/entities/bank-statement-import.js").StatementStatus | undefined,
          from: q.from ? new Date(q.from) : undefined,
          to: q.to ? new Date(q.to) : undefined,
        });
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
        const detail = await this.getStatement.execute(req.params["id"]!, {
          reconciliationStatus: q.reconciliationStatus as import("../../domain/entities/bank-movement.js").ReconciliationStatus | undefined,
          movementType: q.movementType as import("../../domain/entities/bank-movement.js").MovementType | undefined,
          riskLevel: q.riskLevel as import("../../domain/entities/bank-movement.js").RiskLevel | undefined,
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
        const result = await this.applyAutoRules.execute(req.params["id"]!);
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
        const suggestions = await this.suggestMatches.execute(req.params["id"]!);
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
        await this.closeStatement.execute(req.params["id"]!);
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
        await this.updateBalances.execute(req.params["id"]!, opening, closing);
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
        await this.deleteStatement.execute(req.params["id"]!);
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
        if (!body.entityType || !body.entityId) {
          res.status(400).json({ error: "entityType and entityId are required" });
          return;
        }
        await this.reconcileMovement.execute({
          movementId: req.params["movId"]!,
          entityType: body.entityType as "invoice" | "payable_entry",
          entityId: body.entityId as string,
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
        await this.classifyMovement.execute({
          movementId: req.params["movId"]!,
          justificationType: body.justificationType as import("../../domain/entities/bank-movement.js").JustificationType,
          matchedEntityType: body.matchedEntityType as import("../../domain/entities/bank-movement.js").MatchedEntityType | undefined,
          matchedEntityId: body.matchedEntityId as string | undefined,
          riskLevel: body.riskLevel as import("../../domain/entities/bank-movement.js").RiskLevel | undefined,
          notes: body.notes as string | undefined,
          documentUrl: body.documentUrl as string | undefined,
          costCenterGroupId: body.costCenterGroupId as string | undefined,
          costCenterCategoryId: body.costCenterCategoryId as string | undefined,
          supplierId: body.supplierId as string | undefined,
          vatRate: body.vatRate != null ? Number(body.vatRate) : undefined,
          vatIncluded: body.vatIncluded != null ? Boolean(body.vatIncluded) : undefined,
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
            movementId: req.params["movId"]!,
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
        const candidates = await this.findMovementCandidates.execute(req.params["movId"]!);
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
     * GET /bank-statements/rules
     * Query: activeOnly?
     */
    this.router.get("/bank-statements/rules", async (req, res) => {
      try {
        const activeOnly = req.query["activeOnly"] === "true";
        const rules = await this.listRules.execute(activeOnly);
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
        const rule = await this.createRule.execute({
          name: body.name as string,
          descriptionContains: body.descriptionContains as string,
          movementType: body.movementType as import("../../domain/entities/bank-movement.js").MovementType | undefined,
          costCenterGroupId: body.costCenterGroupId as string | undefined,
          costCenterCategoryId: body.costCenterCategoryId as string | undefined,
          justificationType: body.justificationType as import("../../domain/entities/bank-movement.js").JustificationType,
          requiresDocument: body.requiresDocument as boolean | undefined,
          affectsDre: body.affectsDre as boolean | undefined,
          affectsCashflow: body.affectsCashflow as boolean | undefined,
          affectsProfitability: body.affectsProfitability as boolean | undefined,
          riskLevel: body.riskLevel as import("../../domain/entities/bank-movement.js").RiskLevel | undefined,
        });
        res.status(201).json(rule);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * DELETE /bank-statements/rules/:ruleId
     */
    this.router.delete("/bank-statements/rules/:ruleId", async (req, res) => {
      try {
        await this.deleteRule.execute(req.params["ruleId"]!);
        res.status(204).send();
      } catch (e) {
        if (e instanceof RuleNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}
