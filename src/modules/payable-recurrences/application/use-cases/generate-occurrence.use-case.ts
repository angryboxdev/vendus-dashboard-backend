import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { GenerateOccurrencePort, GenerateOccurrenceCommand, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { RecurrenceNotFoundError, OccurrenceAlreadyExistsError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export class GenerateOccurrenceUseCase implements GenerateOccurrencePort {
  private readonly generator = new OccurrenceGeneratorService();

  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
  ) {}

  async execute(command: GenerateOccurrenceCommand): Promise<OccurrenceDTO> {
    const recurrence = await this.recurrenceRepo.findById(command.recurrenceId);
    if (!recurrence) throw new RecurrenceNotFoundError(command.recurrenceId);

    const period = this.generator.toPeriod(command.year, command.month);
    const existing = await this.occurrenceRepo.findByRecurrenceAndPeriod(command.recurrenceId, period);
    if (existing) throw new OccurrenceAlreadyExistsError(command.recurrenceId, period);

    const occurrence = this.generator.generateForMonth(recurrence, command.year, command.month);
    if (!occurrence) {
      throw new Error(
        `Recurrence "${command.recurrenceId}" is not active or out of scope for period "${period}"`,
      );
    }

    await this.occurrenceRepo.save(occurrence);
    return toOccurrenceDTO(occurrence);
  }
}
