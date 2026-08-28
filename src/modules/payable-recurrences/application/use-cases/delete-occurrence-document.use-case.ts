import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export interface DeleteOccurrenceDocumentCommand {
  organizationId: OrganizationId;
  occurrenceId: string;
}

export class DeleteOccurrenceDocumentUseCase {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly storage: DocumentStoragePort,
  ) {}

  async execute(command: DeleteOccurrenceDocumentCommand): Promise<OccurrenceDTO> {
    const occurrence = await this.repo.findById(command.organizationId, command.occurrenceId);
    if (!occurrence) throw new OccurrenceNotFoundError(command.occurrenceId);

    if (occurrence.documentUrl) {
      await this.storage.delete(occurrence.documentUrl);
    }

    const updated = occurrence.setDocumentUrl(null);
    await this.repo.update(command.organizationId, updated);
    return toOccurrenceDTO(updated);
  }
}
