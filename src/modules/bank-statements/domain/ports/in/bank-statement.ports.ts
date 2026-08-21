import type {
  JustificationType,
  MatchedEntityType,
  MovementType,
  ReconciliationStatus,
  RiskLevel,
} from "../../entities/bank-movement.js";
import type { StatementSourceType, StatementStatus } from "../../entities/bank-statement-import.js";

// ─── Import ───────────────────────────────────────────────────────────────────

export interface ParsedMovement {
  bookingDate: Date;
  valueDate: Date;
  description: string;
  amount: number; // cents, absolute
  balanceAfter: number; // cents
  movementType: MovementType;
}

export interface ImportBankStatementCommand {
  /** If provided, links the import directly to this account (skips auto-detect). */
  bankAccountId?: string | null;
  bankName: string;
  accountNumber: string;
  periodStart: Date;
  periodEnd: Date;
  currency?: string;
  sourceType: StatementSourceType;
  sourceFileName?: string | null;
  openingBalance: number; // cents
  closingBalance: number; // cents
  movements: ParsedMovement[];
}

export interface ImportBankStatementResult {
  id: string;
  bankAccountId: string | null;
  /** true when accountNumber matched a registered bank account automatically or via bankAccountId param */
  accountMatched: boolean;
  /** the accountNumber parsed from the file, so the UI can ask the user to link manually */
  parsedAccountNumber: string;
  bankName: string;
  accountNumber: string;
  importedMovementsCount: number;
  skippedDuplicates: number;
  calculatedClosingBalance: number;
  balanceDifference: number;
  reconciliationProgress: number;
  status: StatementStatus;
}

export interface ImportBankStatementPort {
  execute(command: ImportBankStatementCommand): Promise<ImportBankStatementResult>;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface ListBankStatementsFilter {
  accountNumber?: string;
  status?: StatementStatus;
  from?: Date;
  to?: Date;
}

export interface BankStatementSummary {
  id: string;
  bankAccountId: string | null;
  bankName: string;
  accountNumber: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  sourceType: StatementSourceType;
  importedMovementsCount: number;
  openingBalance: number;
  closingBalance: number;
  calculatedClosingBalance: number;
  balanceDifference: number;
  reconciliationProgress: number;
  status: StatementStatus;
  createdAt: Date;
}

export interface ListBankStatementsPort {
  execute(filter?: ListBankStatementsFilter): Promise<BankStatementSummary[]>;
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export interface EntityLinkDto {
  id: string;
  entityType: "invoice" | "payable_entry";
  entityId: string;
  amountCents: number;           // entity's total at time of reconciliation
  allocatedAmountCents: number;  // portion of movement allocated to this entity
  entityLabel: string;
}

export interface BankMovementDto {
  id: string;
  bookingDate: Date;
  valueDate: Date;
  description: string;
  amount: number;
  balanceAfter: number;
  currency: string;
  movementType: MovementType;
  reconciliationStatus: ReconciliationStatus;
  justificationType: JustificationType | null;
  riskLevel: RiskLevel;
  requiresDocument: boolean;
  documentUrl: string | null;
  matchedEntityType: MatchedEntityType | null;
  matchedEntityId: string | null;
  confidenceScore: number | null;
  notes: string | null;
  isResolved: boolean;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  supplierId: string | null;
  vatRate: number | null;
  vatIncluded: boolean | null;
  entityLinks: EntityLinkDto[];
  reconciliationAmountDiff: number | null;
}

export interface BankStatementDetail extends BankStatementSummary {
  sourceFileName: string | null;
  movements: BankMovementDto[];
  statusCounts: Partial<Record<ReconciliationStatus, number>>;
}

export interface GetBankStatementFilter {
  reconciliationStatus?: ReconciliationStatus;
  movementType?: MovementType;
  riskLevel?: RiskLevel;
}

export interface GetBankStatementPort {
  execute(
    id: string,
    filter?: GetBankStatementFilter
  ): Promise<BankStatementDetail | null>;
}

// ─── Reconcile movement ───────────────────────────────────────────────────────

export interface EntityLinkInput {
  entityType: "invoice" | "payable_entry";
  entityId: string;
  /** Amount of the movement allocated to this entity (cents). Must be > 0 and ≤ entity open balance. */
  allocatedAmountCents: number;
  /** supplierId — used to save the description→supplier learning hint. */
  supplierId?: string | null;
}

export interface ReconcileMovementCommand {
  movementId: string;
  /** One or more entities to link to this movement. */
  entityLinks: EntityLinkInput[];
}

export interface ReconcileMovementPort {
  execute(command: ReconcileMovementCommand): Promise<void>;
}

// ─── Unreconcile movement ──────────────────────────────────────────────────────

export interface UnreconcileMovementPort {
  execute(movementId: string): Promise<void>;
}

// ─── Classify movement ────────────────────────────────────────────────────────

export interface ClassifyMovementCommand {
  movementId: string;
  justificationType: JustificationType;
  matchedEntityType?: MatchedEntityType;
  matchedEntityId?: string;
  riskLevel?: RiskLevel;
  notes?: string;
  documentUrl?: string;
  costCenterGroupId?: string;
  costCenterCategoryId?: string;
  supplierId?: string;
  vatRate?: number;
  vatIncluded?: boolean;
}

export interface ClassifyMovementPort {
  execute(command: ClassifyMovementCommand): Promise<void>;
}

// ─── Apply auto rules ─────────────────────────────────────────────────────────

export interface ApplyAutoRulesResult {
  statementImportId: string;
  appliedCount: number;
  reconciliationProgress: number;
}

export interface ApplyAutoRulesPort {
  execute(statementImportId: string): Promise<ApplyAutoRulesResult>;
}

// ─── Suggest matches ──────────────────────────────────────────────────────────

export interface MatchSuggestion {
  movementId: string;
  entityType: MatchedEntityType;
  entityId: string;
  entityLabel: string; // e.g. supplier name + invoice number
  confidence: number; // 0–1
}

export interface SuggestMatchesPort {
  execute(statementImportId: string): Promise<MatchSuggestion[]>;
}

// ─── Create rule ──────────────────────────────────────────────────────────────

export interface CreateReconciliationRuleCommand {
  name: string;
  descriptionContains: string;
  movementType?: MovementType | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  justificationType: JustificationType;
  requiresDocument?: boolean;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  riskLevel?: RiskLevel;
}

export interface ReconciliationRuleDto {
  id: string;
  name: string;
  descriptionContains: string;
  movementType: MovementType | null;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  justificationType: JustificationType;
  requiresDocument: boolean;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  riskLevel: RiskLevel;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateReconciliationRulePort {
  execute(command: CreateReconciliationRuleCommand): Promise<ReconciliationRuleDto>;
}

// ─── List rules ───────────────────────────────────────────────────────────────

export interface ListReconciliationRulesPort {
  execute(activeOnly?: boolean): Promise<ReconciliationRuleDto[]>;
}

// ─── Delete rule ──────────────────────────────────────────────────────────────

export interface DeleteReconciliationRulePort {
  execute(id: string): Promise<void>;
}

// ─── Close statement ──────────────────────────────────────────────────────────

export interface CloseStatementPort {
  execute(statementImportId: string): Promise<void>;
}

export interface DeleteBankStatementPort {
  execute(statementImportId: string): Promise<void>;
}

// ─── Upload movement document ─────────────────────────────────────────────────

export interface UploadMovementDocumentCommand {
  movementId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface UploadMovementDocumentPort {
  execute(command: UploadMovementDocumentCommand): Promise<{ documentUrl: string }>;
}

export interface UpdateStatementBalancesPort {
  execute(statementImportId: string, openingBalance: number, closingBalance: number): Promise<void>;
}

// ─── Link statement to bank account ──────────────────────────────────────────

export interface LinkStatementToAccountPort {
  execute(statementImportId: string, bankAccountId: string): Promise<void>;
}

// ─── Account calendar ─────────────────────────────────────────────────────────

export interface AccountMonthStat {
  year: number;
  month: number; // 1–12
  totalDays: number;
  coveredDays: number;
  totalMovements: number;
  reconciledMovements: number;
  coveragePercent: number; // 0–100
  reconciliationPercent: number; // 0–100
}

export interface GetAccountCalendarQuery {
  bankAccountId: string;
  year: number;
}

export interface GetAccountCalendarPort {
  execute(query: GetAccountCalendarQuery): Promise<AccountMonthStat[]>;
}

// ─── Account month detail ─────────────────────────────────────────────────────

export interface DaySlot {
  date: string; // YYYY-MM-DD
  movements: BankMovementDto[];
  totalDebitCents: number;
  totalCreditCents: number;
  totalMovements: number;
  reconciledCount: number;
}

export interface GetAccountMonthDetailQuery {
  bankAccountId: string;
  year: number;
  month: number; // 1–12
}

export interface GetAccountMonthDetailPort {
  execute(query: GetAccountMonthDetailQuery): Promise<DaySlot[]>;
}

// ─── Find movement candidates ─────────────────────────────────────────────────

export interface MovementCandidate {
  entityType: "invoice" | "payable_entry";
  entityId: string;
  entityLabel: string;
  supplierId: string | null;
  amountCents: number;       // entity's full amount (total with VAT)
  openBalanceCents: number;  // unpaid balance = total - sum of existing allocations
  date: string;              // best available date (paid_at ?? due_date ?? invoice_date)
  confidence: number;
}

export interface FindMovementCandidatesPort {
  execute(movementId: string): Promise<MovementCandidate[]>;
}

// ─── Get movements linked to invoice ──────────────────────────────────────────

export interface InvoiceLinkedMovement {
  movementId: string;
  bookingDate: string;          // YYYY-MM-DD
  description: string;
  allocatedAmountCents: number; // portion of the movement allocated to this invoice
  movementType: MovementType;
}

export interface GetMovementsLinkedToInvoicePort {
  execute(invoiceId: string): Promise<InvoiceLinkedMovement[]>;
}

// ─── Search recurrence occurrence candidates ──────────────────────────────────

export interface OccurrenceCandidateDto {
  id: string;
  recurrenceId: string;
  recurrenceName: string;
  supplierId: string | null;
  supplierName: string;
  period: string;             // YYYY-MM
  effectiveAmountCents: number;
  dueDate: string;            // YYYY-MM-DD
  status: string;
}

export interface SearchOccurrenceCandidatesQuery {
  q?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  limit?: number;
}

export interface SearchOccurrenceCandidatesPort {
  execute(query: SearchOccurrenceCandidatesQuery): Promise<OccurrenceCandidateDto[]>;
}

// ─── Get open balances for multiple invoices ───────────────────────────────────

/**
 * Returns the remaining open balance (cents) for each invoice ID.
 * Invoices with no links have an open balance equal to their totalWithVat.
 * Result key is the invoiceId.
 */
export interface GetInvoiceOpenBalancesPort {
  execute(invoiceIds: string[]): Promise<Record<string, number>>;
}
