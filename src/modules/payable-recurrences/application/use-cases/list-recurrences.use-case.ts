import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { ListRecurrencesPort, ListRecurrencesQuery, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { toRecurrenceDTO } from "./shared.js";

export class ListRecurrencesUseCase implements ListRecurrencesPort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(query: ListRecurrencesQuery): Promise<RecurrenceDTO[]> {
    const { organizationId, ...filter } = query;
    const recurrences = await this.repo.findAll(organizationId, filter);
    return recurrences.map(toRecurrenceDTO);
  }
}
