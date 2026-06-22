import { InvalidFinancialTypeError } from "../errors.js";

export type FinancialType =
  | "cmv"
  | "variable_cost"
  | "fixed_opex"
  | "personnel"
  | "administrative"
  | "marketing"
  | "financial"
  | "capex"
  | "fiscal"
  | "off_dre"
  | "internal_transfer"
  | "transitory";

export const FINANCIAL_TYPES: FinancialType[] = [
  "cmv",
  "variable_cost",
  "fixed_opex",
  "personnel",
  "administrative",
  "marketing",
  "financial",
  "capex",
  "fiscal",
  "off_dre",
  "internal_transfer",
  "transitory",
];

export interface UpdateCostCenterCategoryData {
  name?: string;
  financialType?: FinancialType;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  requiresChannel?: boolean;
  requiresAllocation?: boolean;
  description?: string | null;
}

interface CostCenterCategoryProps {
  id: string;
  groupId: string;
  code: string;
  name: string;
  financialType: FinancialType;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  requiresChannel: boolean;
  requiresAllocation: boolean;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CostCenterCategory {
  readonly id: string;
  readonly groupId: string;
  readonly code: string;
  readonly name: string;
  readonly financialType: FinancialType;
  readonly affectsDre: boolean;
  readonly affectsCashflow: boolean;
  readonly affectsProfitability: boolean;
  readonly requiresChannel: boolean;
  readonly requiresAllocation: boolean;
  readonly isActive: boolean;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CostCenterCategoryProps) {
    this.id = props.id;
    this.groupId = props.groupId;
    this.code = props.code;
    this.name = props.name;
    this.financialType = props.financialType;
    this.affectsDre = props.affectsDre;
    this.affectsCashflow = props.affectsCashflow;
    this.affectsProfitability = props.affectsProfitability;
    this.requiresChannel = props.requiresChannel;
    this.requiresAllocation = props.requiresAllocation;
    this.isActive = props.isActive;
    this.description = props.description;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    groupId: string;
    code: string;
    name: string;
    financialType: string;
    affectsDre: boolean;
    affectsCashflow: boolean;
    affectsProfitability: boolean;
    requiresChannel?: boolean;
    requiresAllocation?: boolean;
    description?: string | null;
  }): CostCenterCategory {
    if (!FINANCIAL_TYPES.includes(props.financialType as FinancialType)) {
      throw new InvalidFinancialTypeError(props.financialType);
    }
    const now = new Date();
    return new CostCenterCategory({
      id: crypto.randomUUID(),
      groupId: props.groupId,
      code: props.code.trim().toUpperCase(),
      name: props.name.trim(),
      financialType: props.financialType as FinancialType,
      affectsDre: props.affectsDre,
      affectsCashflow: props.affectsCashflow,
      affectsProfitability: props.affectsProfitability,
      requiresChannel: props.requiresChannel ?? false,
      requiresAllocation: props.requiresAllocation ?? false,
      isActive: true,
      description: props.description ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: CostCenterCategoryProps): CostCenterCategory {
    return new CostCenterCategory(props);
  }

  update(data: UpdateCostCenterCategoryData): CostCenterCategory {
    if (data.financialType !== undefined && !FINANCIAL_TYPES.includes(data.financialType)) {
      throw new InvalidFinancialTypeError(data.financialType);
    }
    return new CostCenterCategory({
      ...this.toProps(),
      name: data.name !== undefined ? data.name.trim() : this.name,
      financialType: data.financialType ?? this.financialType,
      affectsDre: data.affectsDre ?? this.affectsDre,
      affectsCashflow: data.affectsCashflow ?? this.affectsCashflow,
      affectsProfitability: data.affectsProfitability ?? this.affectsProfitability,
      requiresChannel: data.requiresChannel ?? this.requiresChannel,
      requiresAllocation: data.requiresAllocation ?? this.requiresAllocation,
      description: data.description !== undefined ? data.description : this.description,
      updatedAt: new Date(),
    });
  }

  activate(): CostCenterCategory {
    return new CostCenterCategory({ ...this.toProps(), isActive: true, updatedAt: new Date() });
  }

  deactivate(): CostCenterCategory {
    return new CostCenterCategory({ ...this.toProps(), isActive: false, updatedAt: new Date() });
  }

  private toProps(): CostCenterCategoryProps {
    return {
      id: this.id,
      groupId: this.groupId,
      code: this.code,
      name: this.name,
      financialType: this.financialType,
      affectsDre: this.affectsDre,
      affectsCashflow: this.affectsCashflow,
      affectsProfitability: this.affectsProfitability,
      requiresChannel: this.requiresChannel,
      requiresAllocation: this.requiresAllocation,
      isActive: this.isActive,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
