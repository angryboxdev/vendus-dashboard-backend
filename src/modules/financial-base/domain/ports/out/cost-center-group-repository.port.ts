import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CostCenterGroup } from "../../entities/cost-center-group.js";

export interface CostCenterGroupFilter {
  isActive?: boolean;
}

export interface CostCenterGroupRepositoryPort {
  save(organizationId: OrganizationId, group: CostCenterGroup): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<CostCenterGroup | null>;
  findByCode(organizationId: OrganizationId, code: string): Promise<CostCenterGroup | null>;
  findAll(organizationId: OrganizationId, filter?: CostCenterGroupFilter): Promise<CostCenterGroup[]>;
  update(organizationId: OrganizationId, group: CostCenterGroup): Promise<void>;
}
