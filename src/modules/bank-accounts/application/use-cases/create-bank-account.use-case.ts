import { BankAccount } from "../../domain/entities/bank-account.js";
import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type {
  CreateBankAccountCommand,
  CreateBankAccountPort,
  BankAccountDto,
} from "../../domain/ports/in/bank-accounts.ports.js";
import { BankNotFoundError } from "../../domain/errors.js";

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

export class CreateBankAccountUseCase implements CreateBankAccountPort {
  constructor(
    private readonly bankRepo: BankRepositoryPort,
    private readonly accountRepo: BankAccountRepositoryPort
  ) {}

  async execute(command: CreateBankAccountCommand): Promise<BankAccountDto> {
    const bank = await this.bankRepo.findById(command.bankId);
    if (!bank) throw new BankNotFoundError(command.bankId);
    const account = BankAccount.create(command);
    await this.accountRepo.save(account);
    return toDto(account);
  }
}
