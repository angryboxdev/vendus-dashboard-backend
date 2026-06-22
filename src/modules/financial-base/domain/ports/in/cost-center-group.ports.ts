import type { UpdateCostCenterGroupData } from "../../entities/cost-center-group.js";

// ---- Shared DTO ----
export interface CostCenterGroupDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- List ----
export interface ListCostCenterGroupsCommand {
  isActive?: boolean;
}

export interface ListCostCenterGroupsPort {
  execute(command?: ListCostCenterGroupsCommand): Promise<CostCenterGroupDTO[]>;
}

// ---- Get ----
export interface GetCostCenterGroupCommand {
  id: string;
}

export interface GetCostCenterGroupPort {
  execute(command: GetCostCenterGroupCommand): Promise<CostCenterGroupDTO>;
}

// ---- Create ----
export interface CreateCostCenterGroupCommand {
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}

export interface CreateCostCenterGroupPort {
  execute(command: CreateCostCenterGroupCommand): Promise<CostCenterGroupDTO>;
}

// ---- Update ----
export interface UpdateCostCenterGroupCommand {
  id: string;
  data: UpdateCostCenterGroupData;
}

export interface UpdateCostCenterGroupPort {
  execute(command: UpdateCostCenterGroupCommand): Promise<CostCenterGroupDTO>;
}

// ---- Toggle status ----
export interface ToggleCostCenterGroupStatusCommand {
  id: string;
  isActive: boolean;
}

export interface ToggleCostCenterGroupStatusPort {
  execute(command: ToggleCostCenterGroupStatusCommand): Promise<CostCenterGroupDTO>;
}
