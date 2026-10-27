import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BankCredit, BankDebit } from "../../entities/cash-flow.js";

/** Saída do banco tal como está gravada, antes de lhe juntar o tipo genérico. */
export type StoredBankDebit = Omit<BankDebit, "kind"> & { description: string };
/** Entrada do banco tal como está gravada, antes de lhe juntar o tipo genérico. */
export type StoredBankCredit = Omit<BankCredit, "kind" | "platform" | "restaurantSale"> & { description: string };

/** Movimentos de todas as contas da organização com data entre `from` e `to` (inclusive). */
export interface BankMovementReadPort {
  listDebits(organizationId: OrganizationId, from: string, to: string): Promise<StoredBankDebit[]>;
  listCredits(organizationId: OrganizationId, from: string, to: string): Promise<StoredBankCredit[]>;
}
