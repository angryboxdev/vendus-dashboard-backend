import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ClassificationRule } from "../../domain/entities/classification-rule.js";
import type { ClassificationRuleRepositoryPort } from "../../domain/ports/out/classification-rule-repository.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeClassificationRuleRepository implements ClassificationRuleRepositoryPort {
  private store = new Map<string, ClassificationRule>();

  async findBySupplierId(_organizationId: OrganizationId, supplierId: string): Promise<ClassificationRule | null> {
    for (const rule of this.store.values()) {
      if (rule.supplierId === supplierId) return rule;
    }
    return null;
  }

  async findBySupplierIdAndDescription(
    _organizationId: OrganizationId,
    supplierId: string,
    description?: string,
  ): Promise<ClassificationRule | null> {
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

  async save(_organizationId: OrganizationId, rule: ClassificationRule): Promise<void> {
    this.store.set(rule.id, rule);
  }

  async update(_organizationId: OrganizationId, rule: ClassificationRule): Promise<void> {
    this.store.set(rule.id, rule);
  }
}
