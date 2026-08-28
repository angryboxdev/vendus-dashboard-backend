import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { PauseRecurrencePort, PauseRecurrenceCommand, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class PauseRecurrenceUseCase implements PauseRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(command: PauseRecurrenceCommand): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(command.organizationId, command.id);
    if (!recurrence) throw new RecurrenceNotFoundError(command.id);

    const paused = recurrence.pause();
    await this.repo.update(command.organizationId, paused);
    return toRecurrenceDTO(paused);
  }
}
