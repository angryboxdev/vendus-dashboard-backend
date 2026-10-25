import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SupplierLogoWritePort } from "../../domain/ports/out/supplier-logo.ports.js";
import type { UpdateSupplierPort } from "../../../financial-base/domain/ports/in/supplier.ports.js";

/** Delega ao `UpdateSupplierPort` do financial-base (mesmo padrão de `FinancialBaseSupplierCreateAdapter`). */
export class FinancialBaseSupplierLogoAdapter implements SupplierLogoWritePort {
  constructor(private readonly updateSupplier: UpdateSupplierPort) {}

  async setLogo(organizationId: OrganizationId, supplierId: string, logoUrl: string): Promise<void> {
    await this.updateSupplier.execute({ organizationId, id: supplierId, data: { logoUrl } });
  }
}
