import type { SupplierLocationRule } from "../../domain/entities/supplier-location-rule.js";
import type { SupplierLocationRuleRepositoryPort } from "../../domain/ports/out/supplier-location-rule-repository.port.js";

export class FakeSupplierLocationRuleRepository implements SupplierLocationRuleRepositoryPort {
  rules: SupplierLocationRule[] = [];
  async listBySupplier(_o: unknown, supplierId: string) {
    return this.rules.filter((r) => r.supplierId === supplierId);
  }
  async upsert(_o: unknown, rule: SupplierLocationRule) {
    const i = this.rules.findIndex((r) => r.supplierId === rule.supplierId && r.locationId === rule.locationId);
    const saved = i >= 0 ? { ...rule, id: this.rules[i]!.id, createdAt: this.rules[i]!.createdAt } : rule;
    if (i >= 0) this.rules[i] = saved;
    else this.rules.push(saved);
    return saved;
  }
  async delete(_o: unknown, supplierId: string, locationId: string) {
    this.rules = this.rules.filter((r) => !(r.supplierId === supplierId && r.locationId === locationId));
  }
}
