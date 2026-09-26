import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { ListOccurrencesPort, ListOccurrencesQuery, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import type { InvoiceAllocatedAmountReadPort } from "../../domain/ports/out/invoice-allocated-amount-read.port.js";
import { enrichOccurrencesWithPayments } from "./shared.js";

export class ListOccurrencesUseCase implements ListOccurrencesPort {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
    private readonly invoiceAllocatedAmountRead: InvoiceAllocatedAmountReadPort,
  ) {}

  async execute(query: ListOccurrencesQuery): Promise<OccurrenceDTO[]> {
    const { organizationId, ...filter } = query;
    const occurrences = await this.repo.findAll(organizationId, filter);
    return enrichOccurrencesWithPayments(
      occurrences,
      this.bankMovementLinkRead,
      this.invoiceAllocatedAmountRead,
      organizationId,
    );
  }
}
