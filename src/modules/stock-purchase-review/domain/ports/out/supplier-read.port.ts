import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DefaultStockPolicy } from "../../../../financial-base/domain/entities/supplier.js";

/** D10 — wrapper fino sobre `financial-base`'s `GetSupplierPort`, só projeta `defaultStockPolicy`. */
export interface SupplierReadPort {
  getDefaultStockPolicy(organizationId: OrganizationId, supplierId: string): Promise<DefaultStockPolicy | null>;
}
