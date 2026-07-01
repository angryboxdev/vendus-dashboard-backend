import type { SupplierCreatePort, NewSupplierData, CreatedSupplierRef } from "../../domain/ports/out/supplier-create.port.js";
import type { CreateSupplierPort } from "../../../financial-base/domain/ports/in/supplier.ports.js";

/**
 * Adapter que implementa SupplierCreatePort delegando ao CreateSupplierPort do módulo financial-base.
 * É instanciado no composition root (invoices.module.ts) onde ambos os módulos têm acesso.
 */
export class FinancialBaseSupplierCreateAdapter implements SupplierCreatePort {
  constructor(private readonly createSupplierPort: CreateSupplierPort) {}

  async create(data: NewSupplierData): Promise<CreatedSupplierRef> {
    const supplier = await this.createSupplierPort.execute({
      name: data.name,
      ...(data.nif !== undefined && { nif: data.nif }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.iban !== undefined && { iban: data.iban }),
      ...(data.defaultCostCenterGroupId !== undefined && { defaultCostCenterGroupId: data.defaultCostCenterGroupId }),
      ...(data.defaultCostCenterCategoryId !== undefined && { defaultCostCenterCategoryId: data.defaultCostCenterCategoryId }),
      ...(data.paymentTermsDays !== undefined && { paymentTermsDays: data.paymentTermsDays }),
    });
    return { id: supplier.id, name: supplier.name };
  }
}
