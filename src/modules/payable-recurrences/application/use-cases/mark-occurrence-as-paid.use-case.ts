import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type {
  MarkOccurrenceAsPaidPort,
  MarkOccurrenceAsPaidCommand,
  OccurrenceDTO,
} from "../../domain/ports/in/occurrence.ports.js";
import type { OccurrencePaymentMethod } from "../../domain/entities/recurrence-occurrence.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export class MarkOccurrenceAsPaidUseCase implements MarkOccurrenceAsPaidPort {
  constructor(private readonly occurrenceRepo: OccurrenceRepositoryPort) {}

  async execute(command: MarkOccurrenceAsPaidCommand): Promise<OccurrenceDTO> {
    const occurrence = await this.occurrenceRepo.findById(command.organizationId, command.occurrenceId);
    if (!occurrence) throw new OccurrenceNotFoundError(command.occurrenceId);

    const paidAt = command.paidAt ? new Date(command.paidAt) : new Date();
    const paid = occurrence.markPaid(
      paidAt,
      (command.paymentMethod as OccurrencePaymentMethod) ?? null,
      command.paymentBankAccountId ?? null,
      command.paymentNotes ?? null,
    );

    await this.occurrenceRepo.update(command.organizationId, paid);
    return toOccurrenceDTO(paid);
  }
}
