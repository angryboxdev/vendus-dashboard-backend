import type { ClassificationRule } from "../../domain/entities/classification-rule.js";
import type { ClassificationRuleRepositoryPort } from "../../domain/ports/out/classification-rule-repository.port.js";

export class FakeClassificationRuleRepository implements ClassificationRuleRepositoryPort {
  private store = new Map<string, ClassificationRule>();

  async findBySupplierId(supplierId: string): Promise<ClassificationRule | null> {
    for (const rule of this.store.values()) {
      if (rule.supplierId === supplierId) return rule;
    }
    return null;
  }

  async save(rule: ClassificationRule): Promise<void> {
    this.store.set(rule.id, rule);
  }

  async update(rule: ClassificationRule): Promise<void> {
    this.store.set(rule.id, rule);
  }
}
