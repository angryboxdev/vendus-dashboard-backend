import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export interface UploadOccurrenceDocumentCommand {
  occurrenceId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class UploadOccurrenceDocumentUseCase {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly storage: DocumentStoragePort,
  ) {}

  async execute(command: UploadOccurrenceDocumentCommand): Promise<OccurrenceDTO> {
    const occurrence = await this.repo.findById(command.occurrenceId);
    if (!occurrence) throw new OccurrenceNotFoundError(command.occurrenceId);

    if (occurrence.documentUrl) {
      await this.storage.delete(occurrence.documentUrl);
    }

    const url = await this.storage.store(command.buffer, command.filename, command.mimeType);
    const updated = occurrence.setDocumentUrl(url);
    await this.repo.update(updated);
    return toOccurrenceDTO(updated);
  }
}
