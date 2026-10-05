import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SupplierNameReadPort, SupplierNameSnapshot } from "../../domain/ports/out/supplier-name-read.port.js";

export class FakeSupplierNameRead implements SupplierNameReadPort {
  private byOrg = new Map<OrganizationId, SupplierNameSnapshot[]>();

  setSuppliers(organizationId: OrganizationId, suppliers: SupplierNameSnapshot[]): void {
    this.byOrg.set(organizationId, suppliers);
  }

  async listActive(organizationId: OrganizationId): Promise<SupplierNameSnapshot[]> {
    return this.byOrg.get(organizationId) ?? [];
  }
}
