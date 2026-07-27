import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type {
  UpdateBankAccountCommand,
  UpdateBankAccountPort,
  BankAccountDto,
} from "../../domain/ports/in/bank-accounts.ports.js";
import { BankAccountNotFoundError } from "../../domain/errors.js";
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

export class UpdateBankAccountUseCase implements UpdateBankAccountPort {
  constructor(private readonly repo: BankAccountRepositoryPort) {}

  async execute(command: UpdateBankAccountCommand): Promise<BankAccountDto> {
    const account = await this.repo.findById(command.id);
    if (!account) throw new BankAccountNotFoundError(command.id);
    const updated = account.update(command);
    await this.repo.update(updated);
    return toDto(updated);
  }
}
