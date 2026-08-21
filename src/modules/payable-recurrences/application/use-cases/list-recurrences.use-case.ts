import type { RecurrenceRepositoryPort, RecurrenceFilter } from "../../domain/ports/out/recurrence-repository.port.js";
import type { ListRecurrencesPort, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { toRecurrenceDTO } from "./shared.js";

export class ListRecurrencesUseCase implements ListRecurrencesPort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(filter?: RecurrenceFilter): Promise<RecurrenceDTO[]> {
    const recurrences = await this.repo.findAll(filter);
    return recurrences.map(toRecurrenceDTO);
  }
}
