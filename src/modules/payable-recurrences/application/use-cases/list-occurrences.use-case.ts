import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { ListOccurrencesPort, ListOccurrencesQuery, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import { toOccurrenceDTO } from "./shared.js";

export class ListOccurrencesUseCase implements ListOccurrencesPort {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
  ) {}

  async execute(query: ListOccurrencesQuery): Promise<OccurrenceDTO[]> {
    const { organizationId, ...filter } = query;
    const occurrences = await this.repo.findAll(organizationId, filter);
    if (occurrences.length === 0) return [];

    const bankLinks = await this.bankMovementLinkRead.findByOccurrenceIds(
      organizationId,
      occurrences.map((o) => o.id),
    );
    return occurrences.map((o) => toOccurrenceDTO(o, bankLinks.get(o.id) ?? null));
  }
}
