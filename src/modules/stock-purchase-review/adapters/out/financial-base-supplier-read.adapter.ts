import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSupplierPort } from "../../../financial-base/domain/ports/in/supplier.ports.js";
import type { DefaultStockPolicy } from "../../../financial-base/domain/entities/supplier.js";
import type { SupplierReadPort } from "../../domain/ports/out/supplier-read.port.js";

/** D10 — tradução fina sobre `financial-base`'s `GetSupplierPort`, só projeta `defaultStockPolicy`. */
export class FinancialBaseSupplierReadAdapter implements SupplierReadPort {
  constructor(private readonly getSupplier: GetSupplierPort) {}

  async getDefaultStockPolicy(organizationId: OrganizationId, supplierId: string): Promise<DefaultStockPolicy | null> {
    try {
      const supplier = await this.getSupplier.execute({ organizationId, id: supplierId });
      return supplier.defaultStockPolicy;
    } catch {
      return null;
    }
  }
}
