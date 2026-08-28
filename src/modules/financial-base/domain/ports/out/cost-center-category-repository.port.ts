import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CostCenterCategory } from "../../entities/cost-center-category.js";

export interface CostCenterCategoryFilter {
  groupId?: string;
  isActive?: boolean;
}

export interface CostCenterCategoryRepositoryPort {
  save(organizationId: OrganizationId, category: CostCenterCategory): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<CostCenterCategory | null>;
  findByCode(organizationId: OrganizationId, code: string): Promise<CostCenterCategory | null>;
  findByGroupId(organizationId: OrganizationId, groupId: string): Promise<CostCenterCategory[]>;
  findAll(organizationId: OrganizationId, filter?: CostCenterCategoryFilter): Promise<CostCenterCategory[]>;
  update(organizationId: OrganizationId, category: CostCenterCategory): Promise<void>;
}
