import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { GetRecurrencePort, GetRecurrenceQuery, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class GetRecurrenceUseCase implements GetRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(query: GetRecurrenceQuery): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(query.organizationId, query.id);
    if (!recurrence) throw new RecurrenceNotFoundError(query.id);
    return toRecurrenceDTO(recurrence);
  }
}
