import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { RecipeCostingReport } from "../../entities/recipe-costing.js";

export interface GetRecipeCostingCommand {
  organizationId: OrganizationId;
}

export interface GetRecipeCostingPort {
  execute(command: GetRecipeCostingCommand): Promise<RecipeCostingReport>;
}
