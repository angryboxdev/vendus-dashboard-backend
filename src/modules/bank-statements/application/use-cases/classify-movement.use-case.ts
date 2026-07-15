import { MovementNotFoundError } from "../../domain/errors.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  ClassifyMovementCommand,
  ClassifyMovementPort,
} from "../../domain/ports/in/bank-statement.ports.js";

export class ClassifyMovementUseCase implements ClassifyMovementPort {
  constructor(private readonly movementRepo: BankMovementRepositoryPort) {}

  async execute(command: ClassifyMovementCommand): Promise<void> {
    const movement = await this.movementRepo.findById(command.movementId);
    if (!movement) throw new MovementNotFoundError(command.movementId);

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

    await this.movementRepo.update(updated);
  }
}
