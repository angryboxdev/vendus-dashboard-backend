import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type { DeleteBankCommand, DeleteBankPort } from "../../domain/ports/in/bank-accounts.ports.js";
import { BankNotFoundError, BankHasAccountsError } from "../../domain/errors.js";

export class DeleteBankUseCase implements DeleteBankPort {
  constructor(
    private readonly repo: BankRepositoryPort,
    private readonly accountRepo: BankAccountRepositoryPort,
  ) {}

  async execute(command: DeleteBankCommand): Promise<void> {
    const { organizationId, id } = command;
    const bank = await this.repo.findById(organizationId, id);
    if (!bank) throw new BankNotFoundError(id);
    const accounts = await this.accountRepo.findByBankId(organizationId, id);
    if (accounts.length > 0) throw new BankHasAccountsError(id);
    await this.repo.delete(organizationId, id);
  }
}
