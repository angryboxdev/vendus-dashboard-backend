import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { GetLinkedInvoiceIdsPort } from "../../domain/ports/in/occurrence.ports.js";

export class GetLinkedInvoiceIdsUseCase implements GetLinkedInvoiceIdsPort {
  constructor(private readonly repo: OccurrenceRepositoryPort) {}

  async execute(): Promise<string[]> {
    return this.repo.findLinkedInvoiceIds();
  }
}
