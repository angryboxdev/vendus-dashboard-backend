import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankAccountReadPort } from "../../domain/ports/out/bank-account-read.port.js";
import type { LinkStatementToAccountCommand, LinkStatementToAccountPort } from "../../domain/ports/in/bank-statement.ports.js";
import { StatementNotFoundError } from "../../domain/errors.js";

export class LinkStatementToAccountUseCase implements LinkStatementToAccountPort {
  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly bankAccountRead: BankAccountReadPort
  ) {}

  async execute(command: LinkStatementToAccountCommand): Promise<void> {
    const { organizationId, statementImportId, bankAccountId } = command;
    const statement = await this.statementRepo.findById(organizationId, statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);

    const account = await this.bankAccountRead.findById(organizationId, bankAccountId);
    if (!account) throw new Error(`Bank account not found: ${bankAccountId}`);

    const linked = statement.linkAccount(bankAccountId);
    await this.statementRepo.update(organizationId, linked);
  }
}
