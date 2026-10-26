import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import type { InvoiceAllocatedAmountReadPort } from "../../domain/ports/out/invoice-allocated-amount-read.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type { GetOccurrencePort, GetOccurrenceQuery, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { enrichOccurrencesWithPayments } from "./shared.js";

export class GetOccurrenceUseCase implements GetOccurrencePort {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
    private readonly invoiceAllocatedAmountRead: InvoiceAllocatedAmountReadPort,
    private readonly invoiceRead: InvoiceReadPort | null = null,
  ) {}

  async execute(query: GetOccurrenceQuery): Promise<OccurrenceDTO> {
    const occurrence = await this.repo.findById(query.organizationId, query.id);
    if (!occurrence) throw new OccurrenceNotFoundError(query.id);

    const [dto] = await enrichOccurrencesWithPayments(
      [occurrence],
      this.bankMovementLinkRead,
      this.invoiceAllocatedAmountRead,
      query.organizationId,
      this.invoiceRead,
    );
    return dto!;
  }
}
