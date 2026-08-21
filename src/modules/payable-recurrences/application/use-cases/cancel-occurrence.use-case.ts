import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { CancelOccurrencePort } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";

export class CancelOccurrenceUseCase implements CancelOccurrencePort {
  constructor(private readonly repo: OccurrenceRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const occurrence = await this.repo.findById(id);
    if (!occurrence) throw new OccurrenceNotFoundError(id);

    await this.repo.delete(id);
  }
}
