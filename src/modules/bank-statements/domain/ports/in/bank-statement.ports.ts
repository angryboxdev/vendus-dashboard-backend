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

export interface ReconcileMovementCommand {
  movementId: string;
  entityType: "invoice" | "payable_entry";
  entityId: string;
  /** supplierId do candidato seleccionado — usado para guardar o hint de learning. */
  supplierId?: string | null;
}

export interface ReconcileMovementPort {
  execute(command: ReconcileMovementCommand): Promise<void>;
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

// ─── Find movement candidates ─────────────────────────────────────────────────

export interface MovementCandidate {
  entityType: "invoice" | "payable_entry";
  entityId: string;
  entityLabel: string;
  supplierId: string | null;
  amountCents: number;
  date: string; // best available date (paid_at ?? due_date ?? invoice_date)
  confidence: number;
}

export interface FindMovementCandidatesPort {
  execute(movementId: string): Promise<MovementCandidate[]>;
}
