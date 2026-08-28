import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export interface DeleteRecurrenceDocumentCommand {
  organizationId: OrganizationId;
  recurrenceId: string;
}

export class DeleteRecurrenceDocumentUseCase {
  constructor(
    private readonly repo: RecurrenceRepositoryPort,
    private readonly storage: DocumentStoragePort,
  ) {}

  async execute(command: DeleteRecurrenceDocumentCommand): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(command.organizationId, command.recurrenceId);
    if (!recurrence) throw new RecurrenceNotFoundError(command.recurrenceId);

    if (recurrence.documentUrl) {
      await this.storage.delete(recurrence.documentUrl);
    }

    const updated = recurrence.setDocumentUrl(null);
    await this.repo.update(command.organizationId, updated);
    return toRecurrenceDTO(updated);
  }
}
