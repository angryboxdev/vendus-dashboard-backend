import { MovementNotFoundError } from "../../domain/errors.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  ReconcileMovementCommand,
  ReconcileMovementPort,
} from "../../domain/ports/in/bank-statement.ports.js";

export class ReconcileMovementUseCase implements ReconcileMovementPort {
  constructor(private readonly movementRepo: BankMovementRepositoryPort) {}

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
  }
}
