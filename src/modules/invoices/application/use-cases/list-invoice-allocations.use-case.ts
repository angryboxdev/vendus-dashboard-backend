import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceAllocationDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceAllocationRepositoryPort } from "../../domain/ports/out/invoice-allocation-repository.port.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";

/** Feed de análise por CC para faturas «Por valores» (montantes líquidos, sem IVA). */
export class ListInvoiceAllocationsUseCase {
  constructor(
    private readonly allocationRepo: InvoiceAllocationRepositoryPort,
    private readonly invoiceRepo: Pick<InvoiceRepositoryPort, "findIdsByLineDetailMode">,
  ) {}

  async execute(organizationId: OrganizationId): Promise<InvoiceAllocationDTO[]> {
    const [rows, byValues] = await Promise.all([
      this.allocationRepo.findAll(organizationId),
      this.invoiceRepo.findIdsByLineDetailMode(organizationId, ["by_values"]),
    ]);
    return rows.filter((a) => byValues.has(a.invoiceId)).map((a) => ({ ...a }));
  }
}
