import type { BankMovement, ReconciliationStatus, MovementType, RiskLevel } from "../../entities/bank-movement.js";

export interface BankMovementFilter {
  reconciliationStatus?: ReconciliationStatus;
  movementType?: MovementType;
  riskLevel?: RiskLevel;
  from?: Date;
  to?: Date;
}

export interface BankMovementRepositoryPort {
  saveBulk(movements: BankMovement[]): Promise<void>;
  findByStatementId(
    statementImportId: string,
    filter?: BankMovementFilter
  ): Promise<BankMovement[]>;
  findById(id: string): Promise<BankMovement | null>;
  update(movement: BankMovement): Promise<void>;
  existsByHash(deduplicationHash: string): Promise<boolean>;
}
