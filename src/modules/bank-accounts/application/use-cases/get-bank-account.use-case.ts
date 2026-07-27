import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type { GetBankAccountPort, BankAccountDto } from "../../domain/ports/in/bank-accounts.ports.js";
import type { BankAccount } from "../../domain/entities/bank-account.js";

function toDto(a: BankAccount): BankAccountDto {
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

export class GetBankAccountUseCase implements GetBankAccountPort {
  constructor(private readonly repo: BankAccountRepositoryPort) {}

  async execute(id: string): Promise<BankAccountDto | null> {
    const account = await this.repo.findById(id);
    if (!account) return null;
    return toDto(account);
  }
}
