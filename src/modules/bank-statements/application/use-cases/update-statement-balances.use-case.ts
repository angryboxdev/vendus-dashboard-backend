import type { UpdateStatementBalancesPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import { StatementNotFoundError } from "../../domain/errors.js";

export class UpdateStatementBalancesUseCase implements UpdateStatementBalancesPort {
  constructor(private readonly statementRepo: BankStatementImportRepositoryPort) {}

  async execute(statementImportId: string, openingBalance: number, closingBalance: number): Promise<void> {
    const statement = await this.statementRepo.findById(statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);
    const updated = statement.updateBalances(openingBalance, closingBalance);
    await this.statementRepo.update(updated);
  }
}
