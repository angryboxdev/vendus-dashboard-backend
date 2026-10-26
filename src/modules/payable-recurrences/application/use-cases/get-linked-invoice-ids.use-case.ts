import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type { GetLinkedInvoiceIdsPort, GetLinkedInvoiceIdsQuery } from "../../domain/ports/in/occurrence.ports.js";

export class GetLinkedInvoiceIdsUseCase implements GetLinkedInvoiceIdsPort {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    /** Com ela, as outras faturas do mesmo documento de pagamento também contam como associadas. */
    private readonly invoiceRead: InvoiceReadPort | null = null,
  ) {}

  async execute(query: GetLinkedInvoiceIdsQuery): Promise<string[]> {
    const ids = await this.repo.findLinkedInvoiceIds(query.organizationId);
    if (!this.invoiceRead || !ids.length) return ids;
    const groups = await this.invoiceRead.findPaymentGroupMembers(query.organizationId, ids);
    return [...new Set([...ids, ...[...groups.values()].flat().map((m) => m.id)])];
  }
}
