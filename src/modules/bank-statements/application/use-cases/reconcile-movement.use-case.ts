import { MovementNotFoundError } from "../../domain/errors.js";
import { normalizeBankDescription } from "../../domain/utils/bank-description.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";
import type {
  ReconcileMovementCommand,
  ReconcileMovementPort,
} from "../../domain/ports/in/bank-statement.ports.js";

export class ReconcileMovementUseCase implements ReconcileMovementPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly hint: MovementMatchHintPort,
  ) {}

  async execute(command: ReconcileMovementCommand): Promise<void> {
    const movement = await this.movementRepo.findById(command.movementId);
    if (!movement) throw new MovementNotFoundError(command.movementId);

    const justificationType = command.entityType === "invoice" ? "fatura" : "fatura";

    const updated = movement.classify({
      justificationType,
      matchedEntityType: command.entityType,
      matchedEntityId: command.entityId,
    });

    await this.movementRepo.update(updated);

    // Guardar hint description → supplier para conciliações futuras.
    // Usa a descrição original (pré-confirmação) para que variações ligeiras
    // da mesma descrição sejam reconhecidas automaticamente.
    if (command.supplierId) {
      const normalizedDesc = normalizeBankDescription(movement.description);
      if (normalizedDesc.length > 0) {
        await this.hint.save(normalizedDesc, command.supplierId);
      }
    }
  }
}
