import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export interface UploadRecurrenceDocumentCommand {
  organizationId: OrganizationId;
  recurrenceId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class UploadRecurrenceDocumentUseCase {
  constructor(
    private readonly repo: RecurrenceRepositoryPort,
    private readonly storage: DocumentStoragePort,
  ) {}

  async execute(command: UploadRecurrenceDocumentCommand): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(command.organizationId, command.recurrenceId);
    if (!recurrence) throw new RecurrenceNotFoundError(command.recurrenceId);

    // Delete previous document if exists
    if (recurrence.documentUrl) {
      await this.storage.delete(recurrence.documentUrl);
    }

    const url = await this.storage.store(command.buffer, command.filename, command.mimeType);
    const updated = recurrence.setDocumentUrl(url);
    await this.repo.update(command.organizationId, updated);
    return toRecurrenceDTO(updated);
  }
}
