import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type {
  DeleteBankAccountCommand,
  DeleteBankAccountPort,
} from "../../domain/ports/in/bank-accounts.ports.js";
import { BankAccountNotFoundError, BankAccountHasStatementsError } from "../../domain/errors.js";

export class DeleteBankAccountUseCase implements DeleteBankAccountPort {
  constructor(private readonly repo: BankAccountRepositoryPort) {}

  async execute(command: DeleteBankAccountCommand): Promise<void> {
    const { organizationId, id } = command;
    const account = await this.repo.findById(organizationId, id);
    if (!account) throw new BankAccountNotFoundError(id);
    const count = await this.repo.countStatements(organizationId, id);
    if (count > 0) throw new BankAccountHasStatementsError(id);
    await this.repo.delete(organizationId, id);
  }
}
