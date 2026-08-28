import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { CancelOccurrencePort, CancelOccurrenceCommand } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";

export class CancelOccurrenceUseCase implements CancelOccurrencePort {
  constructor(private readonly repo: OccurrenceRepositoryPort) {}

  async execute(command: CancelOccurrenceCommand): Promise<void> {
    const occurrence = await this.repo.findById(command.organizationId, command.id);
    if (!occurrence) throw new OccurrenceNotFoundError(command.id);

    await this.repo.delete(command.organizationId, command.id);
  }
}
