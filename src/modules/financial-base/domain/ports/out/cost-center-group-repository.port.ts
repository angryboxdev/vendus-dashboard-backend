import type { CostCenterGroup } from "../../entities/cost-center-group.js";

export interface CostCenterGroupFilter {
  isActive?: boolean;
}

export interface CostCenterGroupRepositoryPort {
  save(group: CostCenterGroup): Promise<void>;
  findById(id: string): Promise<CostCenterGroup | null>;
  findByCode(code: string): Promise<CostCenterGroup | null>;
  findAll(filter?: CostCenterGroupFilter): Promise<CostCenterGroup[]>;
  update(group: CostCenterGroup): Promise<void>;
}
