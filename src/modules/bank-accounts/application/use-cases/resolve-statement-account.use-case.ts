import { Bank } from "../../domain/entities/bank.js";
import { BankAccount } from "../../domain/entities/bank-account.js";
import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";
import type {
  ResolveStatementAccountCommand,
  ResolveStatementAccountPort,
  ResolveStatementAccountResult,
} from "../../domain/ports/in/bank-accounts.ports.js";
import { accountNicknameFromLabel, matchesStatementAccount, matchesStatementBank } from "../../domain/services/statement-account-match.js";

/**
 * Banco e conta nascem do primeiro extrato (task «Conciliação bancária V2», §4.1): procura em todas as
 * contas da organização pelo IBAN / nº de conta (nunca cria duplicado); se não houver, reutiliza o banco
 * (mesmo logótipo predefinido ou nome) ou cria-o, e cria a conta com os dados do extrato.
 */
export class ResolveStatementAccountUseCase implements ResolveStatementAccountPort {
  constructor(
    private readonly bankRepo: Pick<BankRepositoryPort, "findAll" | "save">,
    private readonly accountRepo: Pick<BankAccountRepositoryPort, "findByBankId" | "save">,
  ) {}

  async execute(command: ResolveStatementAccountCommand): Promise<ResolveStatementAccountResult | null> {
    const { organizationId } = command;
    if (!command.iban && !command.accountNumber) return null;

    const banks = await this.bankRepo.findAll(organizationId);
    const accountsByBank = await Promise.all(banks.map(async (b) => ({ bank: b, accounts: await this.accountRepo.findByBankId(organizationId, b.id) })));
    for (const { bank, accounts } of accountsByBank) {
      const account = accounts.find((a) => a.isActive && matchesStatementAccount(a, command));
      if (account) {
        return { status: "existing", bankId: bank.id, bankName: bank.name, bankIsNew: false, accountId: account.id, accountName: account.nickname ?? account.iban ?? account.accountNumber ?? "Conta" };
      }
    }

    const existingBank = banks.find((b) => matchesStatementBank(b, command)) ?? null;
    const accountName = accountNicknameFromLabel(command.accountLabel);
    if (!command.create) {
      return { status: "to_create", bankId: existingBank?.id ?? null, bankName: existingBank?.name ?? command.bankName, bankIsNew: !existingBank, accountId: null, accountName };
    }

    const bank =
      existingBank ??
      Bank.create({ name: command.bankName, logoKey: command.logoKey, color: command.color, country: command.country, bic: command.bic, statementFormat: command.statementFormat });
    if (!existingBank) await this.bankRepo.save(organizationId, bank);

    const account = BankAccount.create({
      bankId: bank.id,
      type: "account",
      nickname: accountName,
      iban: command.iban,
      accountNumber: command.accountNumber,
      accountType: "corrente",
    });
    await this.accountRepo.save(organizationId, account);
    return { status: "created", bankId: bank.id, bankName: bank.name, bankIsNew: !existingBank, accountId: account.id, accountName };
  }
}
