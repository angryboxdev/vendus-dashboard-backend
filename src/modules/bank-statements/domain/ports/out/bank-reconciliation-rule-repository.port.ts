import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BankReconciliationRule } from "../../entities/bank-reconciliation-rule.js";

export interface BankReconciliationRuleRepositoryPort {
  save(organizationId: OrganizationId, rule: BankReconciliationRule): Promise<void>;
  findAll(organizationId: OrganizationId, activeOnly?: boolean): Promise<BankReconciliationRule[]>;
  findById(organizationId: OrganizationId, id: string): Promise<BankReconciliationRule | null>;
  update(organizationId: OrganizationId, rule: BankReconciliationRule): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
}
