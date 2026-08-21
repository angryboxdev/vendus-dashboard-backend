import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { GetRecurrencePort, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class GetRecurrenceUseCase implements GetRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(id: string): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(id);
    if (!recurrence) throw new RecurrenceNotFoundError(id);
    return toRecurrenceDTO(recurrence);
  }
}
