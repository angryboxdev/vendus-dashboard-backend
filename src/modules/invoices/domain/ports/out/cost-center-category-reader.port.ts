import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CategorySnapshot } from "../../entities/invoice-line.js";

export interface CategoryLookup {
  id: string;
  code: string;
  name: string;
  financialType: string | null;
  /** F2: validar alocações «Por valores» (subcategoria ativa e do grupo indicado). */
  groupId?: string;
  isActive?: boolean;
}

export interface CostCenterCategoryReaderPort {
  findById(organizationId: OrganizationId, id: string): Promise<CategorySnapshot | null>;
  findManyByIds(organizationId: OrganizationId, ids: string[]): Promise<CategoryLookup[]>;
}
