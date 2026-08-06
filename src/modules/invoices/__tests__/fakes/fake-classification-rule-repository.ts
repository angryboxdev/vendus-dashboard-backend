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

  async findBySupplierIdAndDescription(supplierId: string, description?: string): Promise<ClassificationRule | null> {
    const rules = [...this.store.values()].filter((r) => r.supplierId === supplierId);
    if (description) {
      const desc = description.toLowerCase();
      const specific = rules
        .filter((r) => r.descriptionPattern !== null && desc.includes(r.descriptionPattern.toLowerCase()))
        .sort((a, b) => (b.descriptionPattern?.length ?? 0) - (a.descriptionPattern?.length ?? 0));
      if (specific.length > 0) return specific[0]!;
    }
    return rules.find((r) => r.descriptionPattern === null) ?? null;
  }

  async save(rule: ClassificationRule): Promise<void> {
    this.store.set(rule.id, rule);
  }

  async update(rule: ClassificationRule): Promise<void> {
    this.store.set(rule.id, rule);
  }
}
