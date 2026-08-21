import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { GetOccurrencePort, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export class GetOccurrenceUseCase implements GetOccurrencePort {
  constructor(private readonly repo: OccurrenceRepositoryPort) {}

  async execute(id: string): Promise<OccurrenceDTO> {
    const occurrence = await this.repo.findById(id);
    if (!occurrence) throw new OccurrenceNotFoundError(id);
    return toOccurrenceDTO(occurrence);
  }
}
