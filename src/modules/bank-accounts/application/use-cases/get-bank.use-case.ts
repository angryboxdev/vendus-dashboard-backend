import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type { GetBankPort, GetBankQuery, BankDetailDto } from "../../domain/ports/in/bank-accounts.ports.js";
import type { BankAccount } from "../../domain/entities/bank-account.js";

function accountToDto(a: BankAccount) {
  return {
    id: a.id,
    bankId: a.bankId,
    type: a.type,
    nickname: a.nickname,
    iban: a.iban,
    accountNumber: a.accountNumber,
    accountType: a.accountType,
    lastFourDigits: a.lastFourDigits,
    cardName: a.cardName,
    creditLimitCents: a.creditLimitCents,
    billingCycleDay: a.billingCycleDay,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export class GetBankUseCase implements GetBankPort {
  constructor(
    private readonly bankRepo: BankRepositoryPort,
    private readonly accountRepo: BankAccountRepositoryPort
  ) {}

  async execute(query: GetBankQuery): Promise<BankDetailDto | null> {
    const { organizationId, id } = query;
    const bank = await this.bankRepo.findById(organizationId, id);
    if (!bank) return null;
    const accounts = await this.accountRepo.findByBankId(organizationId, id);
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
      accounts: accounts.map(accountToDto),
    };
  }
}
