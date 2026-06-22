import type { FinancialType, UpdateCostCenterCategoryData } from "../../entities/cost-center-category.js";

// ---- Shared DTO ----
export interface CostCenterCategoryDTO {
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

// ---- List ----
export interface ListCostCenterCategoriesCommand {
  groupId?: string;
  isActive?: boolean;
}

export interface ListCostCenterCategoriesPort {
  execute(command?: ListCostCenterCategoriesCommand): Promise<CostCenterCategoryDTO[]>;
}

// ---- Get ----
export interface GetCostCenterCategoryCommand {
  id: string;
}

export interface GetCostCenterCategoryPort {
  execute(command: GetCostCenterCategoryCommand): Promise<CostCenterCategoryDTO>;
}

// ---- Create ----
export interface CreateCostCenterCategoryCommand {
  groupId: string;
  code: string;
  name: string;
  financialType: FinancialType;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  requiresChannel?: boolean;
  requiresAllocation?: boolean;
  description?: string | null;
}

export interface CreateCostCenterCategoryPort {
  execute(command: CreateCostCenterCategoryCommand): Promise<CostCenterCategoryDTO>;
}

// ---- Update ----
export interface UpdateCostCenterCategoryCommand {
  id: string;
  data: UpdateCostCenterCategoryData;
}

export interface UpdateCostCenterCategoryPort {
  execute(command: UpdateCostCenterCategoryCommand): Promise<CostCenterCategoryDTO>;
}

// ---- Toggle status ----
export interface ToggleCostCenterCategoryStatusCommand {
  id: string;
  isActive: boolean;
}

export interface ToggleCostCenterCategoryStatusPort {
  execute(command: ToggleCostCenterCategoryStatusCommand): Promise<CostCenterCategoryDTO>;
}

// ---- Seed ----
export interface SeedResult {
  groupsCreated: number;
  categoriesCreated: number;
  groupsSkipped: number;
  categoriesSkipped: number;
}

export interface SeedDefaultCostCentersPort {
  execute(): Promise<SeedResult>;
}
