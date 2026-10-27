import type { MovementType } from "../../domain/entities/bank-movement.js";
import type { DescribeMovementPort } from "../../domain/ports/in/describe-movement.port.js";
import { normalizeMovement, type NormalizedMovement } from "../../domain/services/movement-normalizer.service.js";

export class DescribeMovementUseCase implements DescribeMovementPort {
  describe(description: string, movementType: MovementType): NormalizedMovement {
    return normalizeMovement(description, movementType);
  }
}
