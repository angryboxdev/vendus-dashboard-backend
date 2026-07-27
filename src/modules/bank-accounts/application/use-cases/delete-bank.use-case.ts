import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type { DeleteBankPort } from "../../domain/ports/in/bank-accounts.ports.js";
import { BankNotFoundError, BankHasAccountsError } from "../../domain/errors.js";

export class DeleteBankUseCase implements DeleteBankPort {
  constructor(
    private readonly repo: BankRepositoryPort,
    private readonly accountRepo: BankAccountRepositoryPort,
  ) {}

  async execute(id: string): Promise<void> {
    const bank = await this.repo.findById(id);
    if (!bank) throw new BankNotFoundError(id);
    const accounts = await this.accountRepo.findByBankId(id);
    if (accounts.length > 0) throw new BankHasAccountsError(id);
    await this.repo.delete(id);
  }
}
