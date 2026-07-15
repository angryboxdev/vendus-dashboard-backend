import type { BankReconciliationRule } from "../../entities/bank-reconciliation-rule.js";

export interface BankReconciliationRuleRepositoryPort {
  save(rule: BankReconciliationRule): Promise<void>;
  findAll(activeOnly?: boolean): Promise<BankReconciliationRule[]>;
  findById(id: string): Promise<BankReconciliationRule | null>;
  update(rule: BankReconciliationRule): Promise<void>;
  delete(id: string): Promise<void>;
}
