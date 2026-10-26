import type { MovementType } from "../../entities/bank-movement.js";
import type { NormalizedMovement } from "../../services/movement-normalizer.service.js";

/**
 * Descrição legível e tipo de um movimento a partir do descritivo do banco (as mesmas regras da
 * vista do extrato). Exposto a outros módulos (ex.: `cash-flow`) via composition root.
 */
export interface DescribeMovementPort {
  describe(description: string, movementType: MovementType): NormalizedMovement;
}
