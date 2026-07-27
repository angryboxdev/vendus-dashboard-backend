import {
  StatementAlreadyClosedError,
  StatementBalanceDifferenceError,
} from "../errors.js";

export type StatementSourceType = "csv" | "xlsx" | "manual";
export type StatementStatus = "draft" | "in_review" | "completed" | "closed";

export const STATEMENT_STATUSES: StatementStatus[] = [
  "draft",
  "in_review",
  "completed",
  "closed",
];

interface BankStatementImportProps {
  id: string;
  bankAccountId: string | null;
  bankName: string;
  accountNumber: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  sourceType: StatementSourceType;
  sourceFileName: string | null;
  importedMovementsCount: number;
  openingBalance: number; // cents
  closingBalance: number; // cents — value from the statement
  calculatedClosingBalance: number; // cents — computed from movements
  balanceDifference: number; // cents — calculatedClosingBalance - closingBalance
  reconciliationProgress: number; // 0–100
  status: StatementStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class BankStatementImport {
  readonly id: string;
  readonly bankAccountId: string | null;
  readonly bankName: string;
  readonly accountNumber: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currency: string;
  readonly sourceType: StatementSourceType;
  readonly sourceFileName: string | null;
  readonly importedMovementsCount: number;
  readonly openingBalance: number;
  readonly closingBalance: number;
  readonly calculatedClosingBalance: number;
  readonly balanceDifference: number;
  readonly reconciliationProgress: number;
  readonly status: StatementStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BankStatementImportProps) {
    this.id = props.id;
    this.bankAccountId = props.bankAccountId;
    this.bankName = props.bankName;
    this.accountNumber = props.accountNumber;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.currency = props.currency;
    this.sourceType = props.sourceType;
    this.sourceFileName = props.sourceFileName;
    this.importedMovementsCount = props.importedMovementsCount;
    this.openingBalance = props.openingBalance;
    this.closingBalance = props.closingBalance;
    this.calculatedClosingBalance = props.calculatedClosingBalance;
    this.balanceDifference = props.balanceDifference;
    this.reconciliationProgress = props.reconciliationProgress;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    bankAccountId?: string | null;
    bankName: string;
    accountNumber: string;
    periodStart: Date;
    periodEnd: Date;
    currency?: string;
    sourceType: StatementSourceType;
    sourceFileName?: string | null;
    openingBalance: number;
    closingBalance: number;
  }): BankStatementImport {
    if (!props.bankName.trim()) throw new Error("Bank name is required");
    if (!props.accountNumber.trim()) throw new Error("Account number is required");
    if (props.periodStart > props.periodEnd)
      throw new Error("Period start must be before or equal to period end");

    const now = new Date();
    return new BankStatementImport({
      id: crypto.randomUUID(),
      bankAccountId: props.bankAccountId ?? null,
      bankName: props.bankName.trim(),
      accountNumber: props.accountNumber.trim(),
      periodStart: props.periodStart,
      periodEnd: props.periodEnd,
      currency: props.currency ?? "EUR",
      sourceType: props.sourceType,
      sourceFileName: props.sourceFileName ?? null,
      importedMovementsCount: 0,
      openingBalance: props.openingBalance,
      closingBalance: props.closingBalance,
      calculatedClosingBalance: props.openingBalance,
      balanceDifference: props.openingBalance - props.closingBalance,
      reconciliationProgress: 0,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: BankStatementImportProps): BankStatementImport {
    return new BankStatementImport(props);
  }

  /**
   * Returns a new instance with updated stats after movements are saved.
   * Transitions status from "draft" → "in_review" automatically.
   */
  updateStats(stats: {
    importedMovementsCount: number;
    calculatedClosingBalance: number;
    reconciliationProgress: number;
  }): BankStatementImport {
    return new BankStatementImport({
      ...this.toProps(),
      importedMovementsCount: stats.importedMovementsCount,
      calculatedClosingBalance: stats.calculatedClosingBalance,
      balanceDifference: stats.calculatedClosingBalance - this.closingBalance,
      reconciliationProgress: stats.reconciliationProgress,
      status: this.status === "draft" ? "in_review" : this.status,
      updatedAt: new Date(),
    });
  }

  /**
   * Returns a new instance with corrected opening/closing balances.
   * Recalculates balanceDifference = calculatedClosingBalance - newClosingBalance.
   */
  updateBalances(openingBalance: number, closingBalance: number): BankStatementImport {
    if (this.status === "closed") throw new StatementAlreadyClosedError(this.id);
    return new BankStatementImport({
      ...this.toProps(),
      openingBalance,
      closingBalance,
      balanceDifference: this.calculatedClosingBalance - closingBalance,
      updatedAt: new Date(),
    });
  }

  /**
   * Links this statement to a bank account.
   */
  linkAccount(bankAccountId: string): BankStatementImport {
    return new BankStatementImport({
      ...this.toProps(),
      bankAccountId,
      updatedAt: new Date(),
    });
  }

  /**
   * Closes the reconciliation.
   * Invariant: balance difference must be 0.
   * Additional movement validations are enforced by the CloseStatementUseCase.
   */
  close(): BankStatementImport {
    if (this.status === "closed") throw new StatementAlreadyClosedError(this.id);
    if (this.balanceDifference !== 0)
      throw new StatementBalanceDifferenceError(this.id, this.balanceDifference);
    return new BankStatementImport({
      ...this.toProps(),
      status: "closed",
      updatedAt: new Date(),
    });
  }

  private toProps(): BankStatementImportProps {
    return {
      id: this.id,
      bankAccountId: this.bankAccountId,
      bankName: this.bankName,
      accountNumber: this.accountNumber,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      currency: this.currency,
      sourceType: this.sourceType,
      sourceFileName: this.sourceFileName,
      importedMovementsCount: this.importedMovementsCount,
      openingBalance: this.openingBalance,
      closingBalance: this.closingBalance,
      calculatedClosingBalance: this.calculatedClosingBalance,
      balanceDifference: this.balanceDifference,
      reconciliationProgress: this.reconciliationProgress,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
