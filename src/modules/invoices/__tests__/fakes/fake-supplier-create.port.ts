import type { SupplierCreatePort, NewSupplierData, CreatedSupplierRef } from "../../domain/ports/out/supplier-create.port.js";

export class FakeSupplierCreatePort implements SupplierCreatePort {
  public created: NewSupplierData[] = [];

  async create(data: NewSupplierData): Promise<CreatedSupplierRef> {
    this.created.push(data);
    return { id: `supplier-${crypto.randomUUID()}`, name: data.name };
  }
}
