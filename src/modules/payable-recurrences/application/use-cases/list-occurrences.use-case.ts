import type { OccurrenceRepositoryPort, OccurrenceFilter } from "../../domain/ports/out/occurrence-repository.port.js";
import type { ListOccurrencesPort, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import { toOccurrenceDTO } from "./shared.js";

export class ListOccurrencesUseCase implements ListOccurrencesPort {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
  ) {}

  async execute(filter?: OccurrenceFilter): Promise<OccurrenceDTO[]> {
    const occurrences = await this.repo.findAll(filter);
    if (occurrences.length === 0) return [];

    const bankLinks = await this.bankMovementLinkRead.findByOccurrenceIds(occurrences.map((o) => o.id));
    return occurrences.map((o) => toOccurrenceDTO(o, bankLinks.get(o.id) ?? null));
  }
}
