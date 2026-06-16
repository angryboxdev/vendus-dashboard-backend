import type {
  CostCenterCategory,
  CostCenterStatus,
  UpdateCostCenterData,
} from "../../entities/cost-center.js";

// ---- Shared DTO ----
export interface CostCenterDTO {
  id: string;
  code: string;
  name: string;
  category: CostCenterCategory;
  subcategory: string | null;
  description: string | null;
  responsibleName: string | null;
  status: CostCenterStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Create ----
export interface CreateCostCenterCommand {
  code: string;
  name: string;
  category: CostCenterCategory;
  subcategory?: string | null;
  description?: string | null;
  responsibleName?: string | null;
}

export interface CreateCostCenterPort {
  execute(command: CreateCostCenterCommand): Promise<CostCenterDTO>;
}

// ---- Update ----
export interface UpdateCostCenterCommand {
  id: string;
  data: UpdateCostCenterData;
}

export interface UpdateCostCenterPort {
  execute(command: UpdateCostCenterCommand): Promise<CostCenterDTO>;
}

// ---- Toggle status ----
export interface ToggleCostCenterStatusCommand {
  id: string;
  status: "active" | "inactive";
}

export interface ToggleCostCenterStatusPort {
  execute(command: ToggleCostCenterStatusCommand): Promise<CostCenterDTO>;
}

// ---- List ----
export interface ListCostCentersCommand {
  category?: string;
  status?: "active" | "inactive";
}

export interface ListCostCentersPort {
  execute(command?: ListCostCentersCommand): Promise<CostCenterDTO[]>;
}

// ---- Get ----
export interface GetCostCenterCommand {
  id: string;
}

export interface GetCostCenterPort {
  execute(command: GetCostCenterCommand): Promise<CostCenterDTO>;
}
