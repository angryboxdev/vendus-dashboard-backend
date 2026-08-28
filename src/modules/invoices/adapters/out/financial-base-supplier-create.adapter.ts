import type { SupplierCreatePort, NewSupplierData, CreatedSupplierRef } from "../../domain/ports/out/supplier-create.port.js";
import type { CreateSupplierPort } from "../../../financial-base/domain/ports/in/supplier.ports.js";
import { UNATTENDED_SCOPE } from "../../../../infra/scoped-db/unattended-scope.js";

/**
 * Adapter que implementa SupplierCreatePort delegando ao CreateSupplierPort do módulo financial-base.
 * É instanciado no composition root (invoices.module.ts) onde ambos os módulos têm acesso.
 *
 * O módulo invoices ainda não foi convertido à spec B2 (ticket 10) — não há,
 * hoje, uma organização a receber deste caminho. Até essa conversão threadar
 * o `orgId` real do pedido, usa-se o `UNATTENDED_SCOPE` (D6): é literalmente
 * a mesma organização que o antigo `DEFAULT_ORG_ID` do financial-base
 * apontava, apenas nomeada em vez de vir de uma constante local. Ticket 10
 * substitui esta linha por um `organizationId` vindo do pedido.
 */
export class FinancialBaseSupplierCreateAdapter implements SupplierCreatePort {
  constructor(private readonly createSupplierPort: CreateSupplierPort) {}

  async create(data: NewSupplierData): Promise<CreatedSupplierRef> {
    const supplier = await this.createSupplierPort.execute({
      organizationId: UNATTENDED_SCOPE.organizationId,
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
