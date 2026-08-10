import type {
  ListInvoicesPort,
  ListInvoicesFilter,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort, InvoiceFilter } from "../../domain/ports/out/invoice-repository.port.js";
import { toInvoiceDTO } from "./shared.js";

export class ListInvoicesUseCase implements ListInvoicesPort {
  constructor(private readonly invoiceRepo: InvoiceRepositoryPort) {}

  async execute(filter?: ListInvoicesFilter): Promise<InvoiceDTO[]> {
    const repoFilter: InvoiceFilter = {};
    if (filter?.supplierId) repoFilter.supplierId = filter.supplierId;
    if (filter?.costCenterId) repoFilter.costCenterId = filter.costCenterId;
    if (filter?.status) repoFilter.status = filter.status;
    if (filter?.reconciliationStatus) repoFilter.reconciliationStatus = filter.reconciliationStatus;
    if (filter?.from) repoFilter.from = new Date(filter.from);
    if (filter?.to) repoFilter.to = new Date(filter.to);
    if (filter?.search) repoFilter.search = filter.search;

    const invoices = await this.invoiceRepo.findAll(repoFilter);
    return invoices.map((inv) => toInvoiceDTO(inv));
  }
}
