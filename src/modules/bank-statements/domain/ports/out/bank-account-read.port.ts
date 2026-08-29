import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Cross-module output port — lets bank-statements look up bank accounts
 * without depending on the bank-accounts module directly.
 */
export interface BankAccountReadPort {
  findByAccountNumber(organizationId: OrganizationId, raw: string): Promise<{ id: string } | null>;
  findById(organizationId: OrganizationId, id: string): Promise<{ id: string } | null>;
}
