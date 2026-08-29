import type { GetInvoicePort, InvoiceDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export class GetInvoiceUseCase implements GetInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly categoryReader: CostCenterCategoryReaderPort,
  ) {}

  async execute(organizationId: OrganizationId, id: string): Promise<InvoiceDTO> {
    const invoice = await this.invoiceRepo.findById(organizationId, id);
    if (!invoice) throw new InvoiceNotFoundError(id);

    const lines = await this.lineRepo.findByInvoiceId(organizationId, id);

    const categoryIds = [...new Set(
      lines
        .map((l) => l.costCenterCategoryId)
        .filter((c): c is string => c !== null),
    )];
    if (invoice.costCenterCategoryId) categoryIds.push(invoice.costCenterCategoryId);
    const uniqueIds = [...new Set(categoryIds)];

    const categoryLookups = await this.categoryReader.findManyByIds(organizationId, uniqueIds);
    const categoryMap = new Map(categoryLookups.map((c) => [c.id, c]));

    return toInvoiceDTO(invoice, lines, categoryMap);
  }
}
