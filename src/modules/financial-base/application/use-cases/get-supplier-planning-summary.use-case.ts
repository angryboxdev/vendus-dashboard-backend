import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSupplierPlanningSummaryPort, SupplierPlanningSummaryDTO } from "../../domain/ports/in/supplier-planning.ports.js";
import type { SupplierPlanningReadPort } from "../../domain/ports/out/supplier-planning-read.port.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import { SupplierNotFoundError } from "../../domain/errors.js";
import { buildSupplierPlanningSummary, monthsAgo } from "../../domain/services/supplier-planning-summary.js";

/** «Resumo no planeamento» do fornecedor: últimos 12 meses, calculado a cada leitura (sem tabela nem cache). */
export class GetSupplierPlanningSummaryUseCase implements GetSupplierPlanningSummaryPort {
  constructor(
    private readonly suppliers: Pick<SupplierRepositoryPort, "findById">,
    private readonly planningRead: SupplierPlanningReadPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: { organizationId: OrganizationId; supplierId: string }): Promise<SupplierPlanningSummaryDTO> {
    const supplier = await this.suppliers.findById(command.organizationId, command.supplierId);
    if (!supplier) throw new SupplierNotFoundError(command.supplierId);
    const today = this.now();
    const model = await this.planningRead.read(command.organizationId, supplier.id, monthsAgo(today, 12));
    return buildSupplierPlanningSummary(model, today);
  }
}
