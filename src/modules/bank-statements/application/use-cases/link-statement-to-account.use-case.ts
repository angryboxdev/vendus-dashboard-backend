import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankAccountReadPort } from "../../domain/ports/out/bank-account-read.port.js";
import { StatementNotFoundError } from "../../domain/errors.js";

export class LinkStatementToAccountUseCase {
  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly bankAccountRead: BankAccountReadPort
  ) {}

  async execute(statementImportId: string, bankAccountId: string): Promise<void> {
    const statement = await this.statementRepo.findById(statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);

    const account = await this.bankAccountRead.findById(bankAccountId);
    if (!account) throw new Error(`Bank account not found: ${bankAccountId}`);

    const linked = statement.linkAccount(bankAccountId);
    await this.statementRepo.update(linked);
  }
}
