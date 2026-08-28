import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { UpdateBankCommand, UpdateBankPort, BankDto } from "../../domain/ports/in/bank-accounts.ports.js";
import { BankNotFoundError } from "../../domain/errors.js";
import type { Bank } from "../../domain/entities/bank.js";

function toDto(bank: Bank): BankDto {
  return {
    id: bank.id,
    name: bank.name,
    logoKey: bank.logoKey,
    color: bank.color,
    country: bank.country,
    bic: bank.bic,
    statementFormat: bank.statementFormat,
    createdAt: bank.createdAt,
    updatedAt: bank.updatedAt,
  };
}

export class UpdateBankUseCase implements UpdateBankPort {
  constructor(private readonly repo: BankRepositoryPort) {}

  async execute(command: UpdateBankCommand): Promise<BankDto> {
    const bank = await this.repo.findById(command.organizationId, command.id);
    if (!bank) throw new BankNotFoundError(command.id);
    const updated = bank.update(command);
    await this.repo.update(command.organizationId, updated);
    return toDto(updated);
  }
}
