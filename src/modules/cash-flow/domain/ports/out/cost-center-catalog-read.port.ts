import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CostCenterCatalog } from "../../entities/cash-flow.js";

export interface CostCenterCatalogReadPort {
  load(organizationId: OrganizationId): Promise<CostCenterCatalog>;
}
