import type { DescribeMovementPort } from "../../../bank-statements/domain/ports/in/describe-movement.port.js";
import type { MovementKindPort } from "../../domain/ports/out/movement-kind.port.js";

/** Bridges o `DescribeMovementPort` do módulo `bank-statements` (D10): o tipo sai das mesmas regras do extrato. */
export class BankStatementsMovementKindAdapter implements MovementKindPort {
  constructor(private readonly describeMovement: DescribeMovementPort) {}

  kindOf(description: string, movementType: "debit" | "credit"): string {
    return this.describeMovement.describe(description, movementType).kind;
  }
}
