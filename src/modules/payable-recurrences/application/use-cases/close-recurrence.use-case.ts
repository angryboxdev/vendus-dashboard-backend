import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { CloseRecurrencePort, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class CloseRecurrenceUseCase implements CloseRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(id: string): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(id);
    if (!recurrence) throw new RecurrenceNotFoundError(id);

    const closed = recurrence.close();
    await this.repo.update(closed);
    return toRecurrenceDTO(closed);
  }
}
