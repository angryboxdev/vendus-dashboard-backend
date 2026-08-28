import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type {
  ListBankAccountsPort,
  ListBankAccountsQuery,
  BankAccountDto,
} from "../../domain/ports/in/bank-accounts.ports.js";
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

export class ListBankAccountsUseCase implements ListBankAccountsPort {
  constructor(private readonly repo: BankAccountRepositoryPort) {}

  async execute(query: ListBankAccountsQuery): Promise<BankAccountDto[]> {
    const accounts = await this.repo.findByBankId(query.organizationId, query.bankId);
    return accounts.map(toDto);
  }
}
