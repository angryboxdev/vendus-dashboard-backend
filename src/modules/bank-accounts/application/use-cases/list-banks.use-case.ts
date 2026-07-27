import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type { ListBanksPort, BankSummaryDto, AccountPreviewDto } from "../../domain/ports/in/bank-accounts.ports.js";
import type { Bank } from "../../domain/entities/bank.js";
import type { BankAccount } from "../../domain/entities/bank-account.js";

function maskAccountNumber(n: string): string {
  const clean = n.replace(/\s+/g, "");
  return clean.length <= 4 ? clean : `···· ${clean.slice(-4)}`;
}

function maskIban(iban: string): string {
  const clean = iban.replace(/\s+/g, "");
  return `${clean.slice(0, 4)} ···· ${clean.slice(-4)}`;
}

function buildLabel(account: BankAccount): string {
  if (account.type === "credit_card") {
    if (account.lastFourDigits) return `···· ${account.lastFourDigits}`;
    if (account.cardName) return account.cardName;
    if (account.nickname) return account.nickname;
    return "Sem identificador";
  }
  if (account.accountNumber) return maskAccountNumber(account.accountNumber);
  if (account.iban) return maskIban(account.iban);
  if (account.nickname) return account.nickname;
  return "Sem identificador";
}

export class ListBanksUseCase implements ListBanksPort {
  constructor(
    private readonly repo: BankRepositoryPort,
    private readonly accountRepo: BankAccountRepositoryPort,
  ) {}

  async execute(): Promise<BankSummaryDto[]> {
    const banks = await this.repo.findAll();
    const accountsByBank = await Promise.all(
      banks.map((b) => this.accountRepo.findByBankId(b.id)),
    );
    return banks.map((bank: Bank, i) => {
      const accounts = accountsByBank[i] ?? [];
      const accountPreviews: AccountPreviewDto[] = accounts.map((a) => ({
        id: a.id,
        type: a.type,
        label: buildLabel(a),
        isActive: a.isActive,
        nickname: a.nickname,
        accountNumber: a.accountNumber,
        iban: a.iban,
        lastFourDigits: a.lastFourDigits,
        creditLimitCents: a.creditLimitCents,
        accountType: a.accountType,
      }));
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
        accountPreviews,
      };
    });
  }
}
