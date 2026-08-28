import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { ResumeRecurrencePort, ResumeRecurrenceCommand, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class ResumeRecurrenceUseCase implements ResumeRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(command: ResumeRecurrenceCommand): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(command.organizationId, command.id);
    if (!recurrence) throw new RecurrenceNotFoundError(command.id);

    const resumed = recurrence.resume();
    await this.repo.update(command.organizationId, resumed);
    return toRecurrenceDTO(resumed);
  }
}
