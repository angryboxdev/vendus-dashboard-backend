import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BankMovement, ReconciliationStatus, MovementType, RiskLevel } from "../../entities/bank-movement.js";

export interface BankMovementFilter {
  reconciliationStatus?: ReconciliationStatus;
  movementType?: MovementType;
  riskLevel?: RiskLevel;
  from?: Date;
  to?: Date;
}

/** Movimentos conciliados por uma regra («movimento recorrente»). */
export interface RuleUsage {
  ruleId: string;
  movementsCount: number;
  lastBookingDate: string | null; // YYYY-MM-DD
}

export interface BankMovementRepositoryPort {
  saveBulk(organizationId: OrganizationId, movements: BankMovement[]): Promise<void>;
  findByStatementId(
    organizationId: OrganizationId,
    statementImportId: string,
    filter?: BankMovementFilter
  ): Promise<BankMovement[]>;
  findByAccountAndPeriod(
    organizationId: OrganizationId,
    bankAccountId: string,
    from: Date,
    to: Date
  ): Promise<BankMovement[]>;
  findById(organizationId: OrganizationId, id: string): Promise<BankMovement | null>;
  findByIds(organizationId: OrganizationId, ids: string[]): Promise<BankMovement[]>;
  update(organizationId: OrganizationId, movement: BankMovement): Promise<void>;
  existsByHash(organizationId: OrganizationId, deduplicationHash: string): Promise<boolean>;
  /** Tira a ligação à regra dos movimentos que ela conciliou (a classificação mantém-se). */
  detachRule(organizationId: OrganizationId, ruleId: string): Promise<void>;
  ruleUsage(organizationId: OrganizationId): Promise<RuleUsage[]>;
}
