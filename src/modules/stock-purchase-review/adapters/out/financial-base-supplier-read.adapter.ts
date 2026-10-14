import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSupplierPort } from "../../../financial-base/domain/ports/in/supplier.ports.js";
import type { DefaultStockPolicy } from "../../../financial-base/domain/entities/supplier.js";
import type { SupplierReadPort } from "../../domain/ports/out/supplier-read.port.js";
import type { SupplierLocationRulesPort } from "../../../financial-base/domain/ports/in/supplier-location-rules.ports.js";

/** D10 — tradução fina sobre `financial-base`'s `GetSupplierPort`, só projeta `defaultStockPolicy`. */
export class FinancialBaseSupplierReadAdapter implements SupplierReadPort {
  constructor(
    private readonly getSupplier: GetSupplierPort,
    private readonly locationRules: Pick<SupplierLocationRulesPort, "list">,
  ) {}

  async getLocationStockPolicy(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<DefaultStockPolicy | null> {
    const rules = await this.locationRules.list(organizationId, supplierId);
    return rules.find((r) => r.locationId === locationId)?.stockPolicy ?? null;
  }

  async getDefaultStockPolicy(organizationId: OrganizationId, supplierId: string): Promise<DefaultStockPolicy | null> {
    try {
      const supplier = await this.getSupplier.execute({ organizationId, id: supplierId });
      return supplier.defaultStockPolicy;
    } catch {
      return null;
    }
  }
}
