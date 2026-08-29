import type { ListInvoiceLinesPort, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { toInvoiceLineDTO } from "./shared.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export class ListInvoiceLinesUseCase implements ListInvoiceLinesPort {
  constructor(private readonly lineRepo: InvoiceLineRepositoryPort) {}

  async execute(organizationId: OrganizationId): Promise<InvoiceLineDTO[]> {
    const lines = await this.lineRepo.findAll(organizationId);
    return lines.map(toInvoiceLineDTO);
  }
}
