import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type {
  BankStatementSummary,
  ListBankStatementsPort,
  ListBankStatementsQuery,
} from "../../domain/ports/in/bank-statement.ports.js";
import type { BankStatementImport } from "../../domain/entities/bank-statement-import.js";

function toSummary(s: BankStatementImport): BankStatementSummary {
  return {
    id: s.id,
    bankAccountId: s.bankAccountId,
    bankName: s.bankName,
    accountNumber: s.accountNumber,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    currency: s.currency,
    sourceType: s.sourceType,
    importedMovementsCount: s.importedMovementsCount,
    openingBalance: s.openingBalance,
    closingBalance: s.closingBalance,
    calculatedClosingBalance: s.calculatedClosingBalance,
    balanceDifference: s.balanceDifference,
    reconciliationProgress: s.reconciliationProgress,
    status: s.status,
    createdAt: s.createdAt,
  };
}

export class ListBankStatementsUseCase implements ListBankStatementsPort {
  constructor(private readonly statementRepo: BankStatementImportRepositoryPort) {}

  async execute(query: ListBankStatementsQuery): Promise<BankStatementSummary[]> {
    const { organizationId, ...filter } = query;
    const statements = await this.statementRepo.findAll(organizationId, filter);
    return statements.map(toSummary);
  }
}
