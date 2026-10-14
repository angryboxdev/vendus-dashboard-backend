import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SupplierLocationRule } from "../../entities/supplier-location-rule.js";

export interface SupplierLocationRuleRepositoryPort {
  listBySupplier(organizationId: OrganizationId, supplierId: string): Promise<SupplierLocationRule[]>;
  /** Uma exceção por fornecedor/loja: cria ou substitui. */
  upsert(organizationId: OrganizationId, rule: SupplierLocationRule): Promise<SupplierLocationRule>;
  delete(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<void>;
}
