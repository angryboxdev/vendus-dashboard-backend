import type { DeleteBankStatementCommand, DeleteBankStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import { StatementNotFoundError } from "../../domain/errors.js";

export class DeleteBankStatementUseCase implements DeleteBankStatementPort {
  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort
  ) {}

  async execute(command: DeleteBankStatementCommand): Promise<void> {
    const { organizationId, statementImportId } = command;
    const statement = await this.statementRepo.findById(organizationId, statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);
    await this.statementRepo.delete(organizationId, statementImportId);
  }
}
