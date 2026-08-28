import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OrganizationIdentity } from "../../entities/organization-identity.js";

// ---- Get ----
export interface GetOrganizationIdentityCommand {
  organizationId: OrganizationId;
}

export interface GetOrganizationIdentityPort {
  execute(command: GetOrganizationIdentityCommand): Promise<OrganizationIdentity>;
}
