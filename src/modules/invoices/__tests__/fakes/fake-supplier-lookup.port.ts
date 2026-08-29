import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SupplierLookupPort, SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";

export class FakeSupplierLookupPort implements SupplierLookupPort {
  private suppliers: SupplierSummary[] = [];

  seed(suppliers: SupplierSummary[]): void {
    this.suppliers = suppliers;
  }

  async findByNif(_organizationId: OrganizationId, nif: string): Promise<SupplierSummary | null> {
    return this.suppliers.find((s) => s.nif === nif) ?? null;
  }

  async findByName(_organizationId: OrganizationId, query: string): Promise<SupplierSummary[]> {
    const q = query.toLowerCase();
    return this.suppliers.filter((s) => s.name.toLowerCase().includes(q));
  }

  async findAll(_organizationId: OrganizationId): Promise<SupplierSummary[]> {
    return [...this.suppliers];
  }
}
