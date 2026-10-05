import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ListSuppliersPort } from "../../../financial-base/domain/ports/in/supplier.ports.js";
import type { SupplierNameReadPort, SupplierNameSnapshot } from "../../domain/ports/out/supplier-name-read.port.js";

/** D10 — tradução fina sobre `financial-base`'s `ListSuppliersPort`, só projeta `id`/`name`. */
export class FinancialBaseSupplierNameReadAdapter implements SupplierNameReadPort {
  constructor(private readonly listSuppliers: ListSuppliersPort) {}

  async listActive(organizationId: OrganizationId): Promise<SupplierNameSnapshot[]> {
    const suppliers = await this.listSuppliers.execute({ organizationId, status: "active" });
    return suppliers.map((s) => ({ id: s.id, name: s.name }));
  }
}
