import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** D10 → `financial-base`'s `GetSupplierPort`, só projeta o nome (agrupar a lista de compras sugerida por fornecedor). */
export interface SupplierNameReadPort {
  getName(organizationId: OrganizationId, supplierId: string): Promise<string | null>;
}
