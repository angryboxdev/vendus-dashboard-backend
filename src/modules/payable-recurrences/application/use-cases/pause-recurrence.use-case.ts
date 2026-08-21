import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { PauseRecurrencePort, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class PauseRecurrenceUseCase implements PauseRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(id: string): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(id);
    if (!recurrence) throw new RecurrenceNotFoundError(id);

    const paused = recurrence.pause();
    await this.repo.update(paused);
    return toRecurrenceDTO(paused);
  }
}
