import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DefaultStockPolicy } from "../../entities/supplier.js";

export interface SupplierLocationRuleDTO {
  id: string;
  supplierId: string;
  locationId: string;
  stockPolicy: DefaultStockPolicy | null;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  updatedAt: string;
}

export interface UpsertSupplierLocationRuleCommand {
  organizationId: OrganizationId;
  supplierId: string;
  locationId: string;
  stockPolicy?: DefaultStockPolicy | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  actor: string;
}

/** Exceções por loja da ficha do fornecedor (F2 v1.2 §2.1). */
export interface SupplierLocationRulesPort {
  list(organizationId: OrganizationId, supplierId: string): Promise<SupplierLocationRuleDTO[]>;
  upsert(command: UpsertSupplierLocationRuleCommand): Promise<SupplierLocationRuleDTO>;
  remove(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<void>;
}
