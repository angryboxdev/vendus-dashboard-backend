import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BankAccount } from "../../entities/bank-account.js";

export interface BankAccountRepositoryPort {
  save(organizationId: OrganizationId, account: BankAccount): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<BankAccount | null>;
  findByBankId(organizationId: OrganizationId, bankId: string): Promise<BankAccount[]>;
  findByAccountNumber(organizationId: OrganizationId, raw: string): Promise<BankAccount | null>;
  update(organizationId: OrganizationId, account: BankAccount): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
  countStatements(organizationId: OrganizationId, accountId: string): Promise<number>;
}
