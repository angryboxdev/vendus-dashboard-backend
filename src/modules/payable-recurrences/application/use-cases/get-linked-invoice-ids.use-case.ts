import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { GetLinkedInvoiceIdsPort, GetLinkedInvoiceIdsQuery } from "../../domain/ports/in/occurrence.ports.js";

export class GetLinkedInvoiceIdsUseCase implements GetLinkedInvoiceIdsPort {
  constructor(private readonly repo: OccurrenceRepositoryPort) {}

  async execute(query: GetLinkedInvoiceIdsQuery): Promise<string[]> {
    return this.repo.findLinkedInvoiceIds(query.organizationId);
  }
}
