import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { CloseRecurrencePort, CloseRecurrenceCommand, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class CloseRecurrenceUseCase implements CloseRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(command: CloseRecurrenceCommand): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(command.organizationId, command.id);
    if (!recurrence) throw new RecurrenceNotFoundError(command.id);

    const closed = recurrence.close();
    await this.repo.update(command.organizationId, closed);
    return toRecurrenceDTO(closed);
  }
}
