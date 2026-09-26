import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type {
  GenerateBatchOccurrencesPort,
  GenerateBatchCommand,
  BatchGenerationResult,
} from "../../domain/ports/in/batch.ports.js";
import { toOccurrenceDTO, ensureOccurrencesForPeriod } from "./shared.js";

export class GenerateBatchOccurrencesUseCase implements GenerateBatchOccurrencesPort {
  private readonly generator = new OccurrenceGeneratorService();

  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
  ) {}

  async execute(command: GenerateBatchCommand): Promise<BatchGenerationResult> {
    const { organizationId } = command;
    const period = this.generator.toPeriod(command.year, command.month);

    const { generated, skippedAlreadyExists, skippedOutOfScope } = await ensureOccurrencesForPeriod(
      organizationId,
      command.year,
      command.month,
      this.recurrenceRepo,
      this.occurrenceRepo,
    );

    return { period, generated: generated.map((o) => toOccurrenceDTO(o)), skippedAlreadyExists, skippedOutOfScope };
  }
}
