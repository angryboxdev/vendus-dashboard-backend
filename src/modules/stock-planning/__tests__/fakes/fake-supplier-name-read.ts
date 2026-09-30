import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SupplierNameReadPort } from "../../domain/ports/out/supplier-name-read.port.js";

export class FakeSupplierNameRead implements SupplierNameReadPort {
  namesById = new Map<string, string>();

  async getName(_organizationId: OrganizationId, supplierId: string): Promise<string | null> {
    return this.namesById.get(supplierId) ?? null;
  }
}
