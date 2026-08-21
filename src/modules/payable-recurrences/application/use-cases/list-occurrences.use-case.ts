import type { OccurrenceRepositoryPort, OccurrenceFilter } from "../../domain/ports/out/occurrence-repository.port.js";
import type { ListOccurrencesPort, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { toOccurrenceDTO } from "./shared.js";

export class ListOccurrencesUseCase implements ListOccurrencesPort {
  constructor(private readonly repo: OccurrenceRepositoryPort) {}

  async execute(filter?: OccurrenceFilter): Promise<OccurrenceDTO[]> {
    const occurrences = await this.repo.findAll(filter);
    return occurrences.map(toOccurrenceDTO);
  }
}
