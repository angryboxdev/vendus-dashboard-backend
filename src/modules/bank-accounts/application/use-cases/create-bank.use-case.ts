import { Bank } from "../../domain/entities/bank.js";
import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { CreateBankCommand, CreateBankPort, BankDto } from "../../domain/ports/in/bank-accounts.ports.js";

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

export class CreateBankUseCase implements CreateBankPort {
  constructor(private readonly repo: BankRepositoryPort) {}

  async execute(command: CreateBankCommand): Promise<BankDto> {
    const bank = Bank.create(command);
    await this.repo.save(command.organizationId, bank);
    return toDto(bank);
  }
}
