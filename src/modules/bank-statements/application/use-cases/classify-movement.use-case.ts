import { MovementNotFoundError } from "../../domain/errors.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { OccurrencePaymentPort } from "../../domain/ports/out/occurrence-payment.port.js";
import type {
  ClassifyMovementCommand,
  ClassifyMovementPort,
} from "../../domain/ports/in/bank-statement.ports.js";

export class ClassifyMovementUseCase implements ClassifyMovementPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    /** Recorrências: o movimento ligado a uma ocorrência deixa-a paga; mudar de ocorrência reabre a anterior. */
    private readonly occurrencePayment?: OccurrencePaymentPort,
  ) {}

  async execute(command: ClassifyMovementCommand): Promise<void> {
    const movement = await this.movementRepo.findById(command.organizationId, command.movementId);
    if (!movement) throw new MovementNotFoundError(command.movementId);
    const previousOccurrence = movement.matchedEntityType === "recurrence_occurrence" ? movement.matchedEntityId : null;

    const updated = movement.classify({
      justificationType: command.justificationType,
      ...(command.matchedEntityType !== undefined && { matchedEntityType: command.matchedEntityType }),
      ...(command.matchedEntityId !== undefined && { matchedEntityId: command.matchedEntityId }),
      ...(command.riskLevel !== undefined && { riskLevel: command.riskLevel }),
      ...(command.notes !== undefined && { notes: command.notes }),
      ...(command.documentUrl !== undefined && { documentUrl: command.documentUrl }),
      ...(command.costCenterGroupId !== undefined && { costCenterGroupId: command.costCenterGroupId }),
      ...(command.costCenterCategoryId !== undefined && { costCenterCategoryId: command.costCenterCategoryId }),
      ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
      ...(command.vatRate !== undefined && { vatRate: command.vatRate }),
      ...(command.vatIncluded !== undefined && { vatIncluded: command.vatIncluded }),
    });

    await this.movementRepo.update(command.organizationId, updated);

    if (!this.occurrencePayment) return;
    const currentOccurrence =
      updated.justificationType === "contrato_recorrencia" && updated.matchedEntityType === "recurrence_occurrence" ? updated.matchedEntityId : null;
    if (previousOccurrence && previousOccurrence !== currentOccurrence) {
      await this.occurrencePayment.reopen(command.organizationId, { occurrenceId: previousOccurrence, movementId: updated.id });
    }
    if (currentOccurrence) {
      await this.occurrencePayment.settle(command.organizationId, {
        occurrenceId: currentOccurrence,
        movementId: updated.id,
        paidAt: updated.bookingDate.toISOString().slice(0, 10),
        bankAccountId: updated.bankAccountId,
      });
    }
  }
}
