import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export class DeleteOccurrenceDocumentUseCase {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly storage: DocumentStoragePort,
  ) {}

  async execute(occurrenceId: string): Promise<OccurrenceDTO> {
    const occurrence = await this.repo.findById(occurrenceId);
    if (!occurrence) throw new OccurrenceNotFoundError(occurrenceId);

    if (occurrence.documentUrl) {
      await this.storage.delete(occurrence.documentUrl);
    }

    const updated = occurrence.setDocumentUrl(null);
    await this.repo.update(updated);
    return toOccurrenceDTO(updated);
  }
}
