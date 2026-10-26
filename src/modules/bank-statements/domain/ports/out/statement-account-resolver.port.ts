import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StatementTemplateId } from "../../services/statement-pdf/statement-template.js";

/** O que o extrato diz sobre o banco e a conta (para os encontrar ou criar). */
export interface StatementAccountHints {
  template: StatementTemplateId;
  bankName: string;
  bic: string | null;
  iban: string | null;
  accountNumber: string | null;
  accountLabel: string | null;
}

export interface StatementAccountResolution {
  /** existing = conta já registada; created = criada agora; to_create = seria criada. */
  status: "existing" | "created" | "to_create";
  bankId: string | null;
  bankName: string;
  bankIsNew: boolean;
  accountId: string | null;
  accountName: string;
}

/** Banco e conta do extrato no módulo bank-accounts (D10): encontra pelo IBAN/nº, ou cria com `create`. */
export interface StatementAccountResolverPort {
  resolve(organizationId: OrganizationId, hints: StatementAccountHints, options: { create: boolean }): Promise<StatementAccountResolution | null>;
}
