import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StatementAccountHints, StatementAccountResolution, StatementAccountResolverPort } from "../../domain/ports/out/statement-account-resolver.port.js";
import type { StatementTemplateId } from "../../domain/services/statement-pdf/parsed-statement.js";
import type { ResolveStatementAccountPort } from "../../../bank-accounts/domain/ports/in/bank-accounts.ports.js";
import type { BankLogoKey, StatementFormat } from "../../../bank-accounts/domain/entities/bank.js";

/** Como cada modelo de extrato se traduz num banco registado (logótipo, formato, cor, país). */
const TEMPLATE_BANK: Record<StatementTemplateId, { logoKey: BankLogoKey; statementFormat: StatementFormat; color: string; country: string }> = {
  millennium_pdf: { logoKey: "millennium_bcp", statementFormat: "millennium_bcp_pdf", color: "#C5004F", country: "PT" },
};

/** Delega no `ResolveStatementAccountPort` do módulo bank-accounts (mesmo padrão dos outros adapters cross-módulo). */
export class BankAccountsStatementAccountAdapter implements StatementAccountResolverPort {
  constructor(private readonly resolveAccount: ResolveStatementAccountPort) {}

  async resolve(organizationId: OrganizationId, hints: StatementAccountHints, options: { create: boolean }): Promise<StatementAccountResolution | null> {
    const bank = TEMPLATE_BANK[hints.template];
    return this.resolveAccount.execute({
      organizationId,
      bankName: hints.bankName,
      logoKey: bank.logoKey,
      statementFormat: bank.statementFormat,
      color: bank.color,
      country: bank.country,
      bic: hints.bic,
      iban: hints.iban,
      accountNumber: hints.accountNumber,
      accountLabel: hints.accountLabel,
      create: options.create,
    });
  }
}
