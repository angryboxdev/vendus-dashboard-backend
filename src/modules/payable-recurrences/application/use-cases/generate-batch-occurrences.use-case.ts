import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type {
  GenerateBatchOccurrencesPort,
  GenerateBatchCommand,
  BatchGenerationResult,
} from "../../domain/ports/in/batch.ports.js";
import type { OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { toOccurrenceDTO } from "./shared.js";

export class GenerateBatchOccurrencesUseCase implements GenerateBatchOccurrencesPort {
  private readonly generator = new OccurrenceGeneratorService();

  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
  ) {}

  async execute(command: GenerateBatchCommand): Promise<BatchGenerationResult> {
    const period = this.generator.toPeriod(command.year, command.month);
    const activeRecurrences = await this.recurrenceRepo.findAll({ status: "active" });

    const generated: OccurrenceDTO[] = [];
    let skippedAlreadyExists = 0;
    let skippedOutOfScope = 0;

    for (const recurrence of activeRecurrences) {
      const existing = await this.occurrenceRepo.findByRecurrenceAndPeriod(recurrence.id, period);
      if (existing) {
        skippedAlreadyExists++;
        continue;
      }

      const occurrence = this.generator.generateForMonth(recurrence, command.year, command.month);
      if (!occurrence) {
        skippedOutOfScope++;
        continue;
      }

      await this.occurrenceRepo.save(occurrence);
      generated.push(toOccurrenceDTO(occurrence));
    }

    return { period, generated, skippedAlreadyExists, skippedOutOfScope };
  }
}
