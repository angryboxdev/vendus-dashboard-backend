import { InvalidClassificationError, MovementNotFoundError } from "../../domain/errors.js";
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

    // Só classificar / remover a classificação: sem ligação a ocorrência; reabre a ocorrência que estivesse paga.
    if (command.mode === "classify" || command.mode === "clear") {
      let next;
      if (command.mode === "clear") next = movement.clearClassification();
      else {
        const categoryId = command.costCenterCategoryId ?? null;
        const groupId = command.costCenterGroupId ?? null;
        if (categoryId === null && groupId === null) throw new InvalidClassificationError("Escolha a categoria para classificar o movimento.");
        next = movement.classifyOnly({
          costCenterGroupId: groupId,
          costCenterCategoryId: categoryId,
          ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
          ...(command.vatRate !== undefined && { vatRate: command.vatRate }),
          ...(command.vatIncluded !== undefined && { vatIncluded: command.vatIncluded }),
          ...(command.notes !== undefined && { notes: command.notes }),
        });
      }
      await this.movementRepo.update(command.organizationId, next);
      if (previousOccurrence && this.occurrencePayment) {
        await this.occurrencePayment.reopen(command.organizationId, { occurrenceId: previousOccurrence, movementId: next.id });
      }
      return;
    }
    if (!command.justificationType) throw new InvalidClassificationError("justificationType is required");

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

    if (!this.occurrencePayment) {
      await this.movementRepo.update(command.organizationId, updated);
      return;
    }
    const currentOccurrence =
      updated.justificationType === "contrato_recorrencia" && updated.matchedEntityType === "recurrence_occurrence" ? updated.matchedEntityId : null;
    // Primeiro a ocorrência: se tiver fatura, recusa (OccurrenceRequiresInvoiceError) sem gravar nada.
    if (currentOccurrence) {
      await this.occurrencePayment.settle(command.organizationId, {
        occurrenceId: currentOccurrence,
        movementId: updated.id,
        paidAt: updated.bookingDate.toISOString().slice(0, 10),
        bankAccountId: updated.bankAccountId,
      });
    }
    try {
      await this.movementRepo.update(command.organizationId, updated);
    } catch (e) {
      if (currentOccurrence) await this.occurrencePayment.reopen(command.organizationId, { occurrenceId: currentOccurrence, movementId: updated.id });
      throw e;
    }
    if (previousOccurrence && previousOccurrence !== currentOccurrence) {
      await this.occurrencePayment.reopen(command.organizationId, { occurrenceId: previousOccurrence, movementId: updated.id });
    }
  }
}
