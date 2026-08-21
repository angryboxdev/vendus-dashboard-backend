import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class DeleteRecurrenceDocumentUseCase {
  constructor(
    private readonly repo: RecurrenceRepositoryPort,
    private readonly storage: DocumentStoragePort,
  ) {}

  async execute(recurrenceId: string): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(recurrenceId);
    if (!recurrence) throw new RecurrenceNotFoundError(recurrenceId);

    if (recurrence.documentUrl) {
      await this.storage.delete(recurrence.documentUrl);
    }

    const updated = recurrence.setDocumentUrl(null);
    await this.repo.update(updated);
    return toRecurrenceDTO(updated);
  }
}
