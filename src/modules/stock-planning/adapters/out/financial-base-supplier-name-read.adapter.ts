import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSupplierPort } from "../../../financial-base/domain/ports/in/supplier.ports.js";
import type { SupplierNameReadPort } from "../../domain/ports/out/supplier-name-read.port.js";

/** D10 — tradução fina sobre `financial-base`'s `GetSupplierPort` (mesmo padrão de `FinancialBaseSupplierReadAdapter`). */
export class FinancialBaseSupplierNameReadAdapter implements SupplierNameReadPort {
  constructor(private readonly getSupplier: GetSupplierPort) {}

  async getName(organizationId: OrganizationId, supplierId: string): Promise<string | null> {
    try {
      const supplier = await this.getSupplier.execute({ organizationId, id: supplierId });
      return supplier.name;
    } catch {
      return null;
    }
  }
}
