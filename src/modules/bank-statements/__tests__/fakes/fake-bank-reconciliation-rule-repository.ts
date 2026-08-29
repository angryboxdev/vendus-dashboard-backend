import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeBankReconciliationRuleRepository
  implements BankReconciliationRuleRepositoryPort
{
  private store = new Map<string, BankReconciliationRule>();

  async save(organizationId: OrganizationId, rule: BankReconciliationRule): Promise<void> {
    this.store.set(key(organizationId, rule.id), rule);
  }

  async findAll(
    organizationId: OrganizationId,
    activeOnly = false
  ): Promise<BankReconciliationRule[]> {
    const prefix = `${organizationId}:`;
    const results = [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, r]) => r);
    return activeOnly ? results.filter((r) => r.isActive) : results;
  }

  async findById(
    organizationId: OrganizationId,
    id: string
  ): Promise<BankReconciliationRule | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async update(organizationId: OrganizationId, rule: BankReconciliationRule): Promise<void> {
    const k = key(organizationId, rule.id);
    if (!this.store.has(k)) throw new Error(`Rule ${rule.id} not found`);
    this.store.set(k, rule);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    this.store.delete(key(organizationId, id));
  }
}
