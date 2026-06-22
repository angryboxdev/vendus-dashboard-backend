import type { CostCenterCategory } from "../../entities/cost-center-category.js";

export interface CostCenterCategoryFilter {
  groupId?: string;
  isActive?: boolean;
}

export interface CostCenterCategoryRepositoryPort {
  save(category: CostCenterCategory): Promise<void>;
  findById(id: string): Promise<CostCenterCategory | null>;
  findByCode(code: string): Promise<CostCenterCategory | null>;
  findByGroupId(groupId: string): Promise<CostCenterCategory[]>;
  findAll(filter?: CostCenterCategoryFilter): Promise<CostCenterCategory[]>;
  update(category: CostCenterCategory): Promise<void>;
}
