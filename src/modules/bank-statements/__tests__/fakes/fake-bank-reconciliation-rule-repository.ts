import type { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";

export class FakeBankReconciliationRuleRepository
  implements BankReconciliationRuleRepositoryPort
{
  private store = new Map<string, BankReconciliationRule>();

  async save(rule: BankReconciliationRule): Promise<void> {
    this.store.set(rule.id, rule);
  }

  async findAll(activeOnly = false): Promise<BankReconciliationRule[]> {
    const results = [...this.store.values()];
    return activeOnly ? results.filter((r) => r.isActive) : results;
  }

  async findById(id: string): Promise<BankReconciliationRule | null> {
    return this.store.get(id) ?? null;
  }

  async update(rule: BankReconciliationRule): Promise<void> {
    if (!this.store.has(rule.id)) throw new Error(`Rule ${rule.id} not found`);
    this.store.set(rule.id, rule);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
