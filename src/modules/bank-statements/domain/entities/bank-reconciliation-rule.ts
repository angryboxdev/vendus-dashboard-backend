import type { JustificationType, MovementType, RiskLevel } from "./bank-movement.js";

interface BankReconciliationRuleProps {
  id: string;
  name: string;
  descriptionContains: string; // case-insensitive match
  movementType: MovementType | null; // null = applies to both
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  justificationType: JustificationType;
  requiresDocument: boolean;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  riskLevel: RiskLevel;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class BankReconciliationRule {
  readonly id: string;
  readonly name: string;
  readonly descriptionContains: string;
  readonly movementType: MovementType | null;
  readonly costCenterGroupId: string | null;
  readonly costCenterCategoryId: string | null;
  readonly justificationType: JustificationType;
  readonly requiresDocument: boolean;
  readonly affectsDre: boolean;
  readonly affectsCashflow: boolean;
  readonly affectsProfitability: boolean;
  readonly riskLevel: RiskLevel;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BankReconciliationRuleProps) {
    this.id = props.id;
    this.name = props.name;
    this.descriptionContains = props.descriptionContains;
    this.movementType = props.movementType;
    this.costCenterGroupId = props.costCenterGroupId;
    this.costCenterCategoryId = props.costCenterCategoryId;
    this.justificationType = props.justificationType;
    this.requiresDocument = props.requiresDocument;
    this.affectsDre = props.affectsDre;
    this.affectsCashflow = props.affectsCashflow;
    this.affectsProfitability = props.affectsProfitability;
    this.riskLevel = props.riskLevel;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    name: string;
    descriptionContains: string;
    movementType?: MovementType | null;
    costCenterGroupId?: string | null;
    costCenterCategoryId?: string | null;
    justificationType: JustificationType;
    requiresDocument?: boolean;
    affectsDre?: boolean;
    affectsCashflow?: boolean;
    affectsProfitability?: boolean;
    riskLevel?: RiskLevel;
  }): BankReconciliationRule {
    if (!props.name.trim()) throw new Error("Rule name is required");
    if (!props.descriptionContains.trim())
      throw new Error("descriptionContains is required");

    const now = new Date();
    return new BankReconciliationRule({
      id: crypto.randomUUID(),
      name: props.name.trim(),
      descriptionContains: props.descriptionContains.trim(),
      movementType: props.movementType ?? null,
      costCenterGroupId: props.costCenterGroupId ?? null,
      costCenterCategoryId: props.costCenterCategoryId ?? null,
      justificationType: props.justificationType,
      requiresDocument: props.requiresDocument ?? false,
      affectsDre: props.affectsDre ?? true,
      affectsCashflow: props.affectsCashflow ?? true,
      affectsProfitability: props.affectsProfitability ?? false,
      riskLevel: props.riskLevel ?? "low",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: BankReconciliationRuleProps): BankReconciliationRule {
    return new BankReconciliationRule(props);
  }

  deactivate(): BankReconciliationRule {
    return new BankReconciliationRule({
      ...this.toProps(),
      isActive: false,
      updatedAt: new Date(),
    });
  }

  private toProps(): BankReconciliationRuleProps {
    return {
      id: this.id,
      name: this.name,
      descriptionContains: this.descriptionContains,
      movementType: this.movementType,
      costCenterGroupId: this.costCenterGroupId,
      costCenterCategoryId: this.costCenterCategoryId,
      justificationType: this.justificationType,
      requiresDocument: this.requiresDocument,
      affectsDre: this.affectsDre,
      affectsCashflow: this.affectsCashflow,
      affectsProfitability: this.affectsProfitability,
      riskLevel: this.riskLevel,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
