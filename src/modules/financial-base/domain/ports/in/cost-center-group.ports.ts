import type { OrganizationId } from "../../../../../kernel/organization-id.js";
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
  organizationId: OrganizationId;
  isActive?: boolean;
}

export interface ListCostCenterGroupsPort {
  execute(command: ListCostCenterGroupsCommand): Promise<CostCenterGroupDTO[]>;
}

// ---- Get ----
export interface GetCostCenterGroupCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface GetCostCenterGroupPort {
  execute(command: GetCostCenterGroupCommand): Promise<CostCenterGroupDTO>;
}

// ---- Create ----
export interface CreateCostCenterGroupCommand {
  organizationId: OrganizationId;
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
  organizationId: OrganizationId;
  id: string;
  data: UpdateCostCenterGroupData;
}

export interface UpdateCostCenterGroupPort {
  execute(command: UpdateCostCenterGroupCommand): Promise<CostCenterGroupDTO>;
}

// ---- Toggle status ----
export interface ToggleCostCenterGroupStatusCommand {
  organizationId: OrganizationId;
  id: string;
  isActive: boolean;
}

export interface ToggleCostCenterGroupStatusPort {
  execute(command: ToggleCostCenterGroupStatusCommand): Promise<CostCenterGroupDTO>;
}
