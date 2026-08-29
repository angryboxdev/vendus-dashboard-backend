import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CategorySnapshot } from "../../entities/invoice-line.js";

export interface CategoryLookup {
  id: string;
  code: string;
  name: string;
  financialType: string | null;
}

export interface CostCenterCategoryReaderPort {
  findById(organizationId: OrganizationId, id: string): Promise<CategorySnapshot | null>;
  findManyByIds(organizationId: OrganizationId, ids: string[]): Promise<CategoryLookup[]>;
}
