import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DefaultStockPolicy } from "../../../financial-base/domain/entities/supplier.js";
import type { SupplierReadPort } from "../../domain/ports/out/supplier-read.port.js";

export class FakeSupplierRead implements SupplierReadPort {
  policies = new Map<string, DefaultStockPolicy>();
  locationPolicies = new Map<string, DefaultStockPolicy>();

  async getLocationStockPolicy(_organizationId: OrganizationId, supplierId: string, locationId: string): Promise<DefaultStockPolicy | null> {
    return this.locationPolicies.get(`${supplierId}:${locationId}`) ?? null;
  }

  async getDefaultStockPolicy(_organizationId: OrganizationId, supplierId: string): Promise<DefaultStockPolicy | null> {
    return this.policies.get(supplierId) ?? null;
  }
}
