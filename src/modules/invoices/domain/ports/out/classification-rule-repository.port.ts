import type { ClassificationRule } from "../../entities/classification-rule.js";

export interface ClassificationRuleRepositoryPort {
  findBySupplierId(supplierId: string): Promise<ClassificationRule | null>;
  save(rule: ClassificationRule): Promise<void>;
  update(rule: ClassificationRule): Promise<void>;
}
