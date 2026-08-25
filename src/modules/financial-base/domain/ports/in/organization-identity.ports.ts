import type { OrganizationIdentity } from "../../entities/organization-identity.js";

// ---- Get ----
export interface GetOrganizationIdentityCommand {
  orgId: string;
}

export interface GetOrganizationIdentityPort {
  execute(command: GetOrganizationIdentityCommand): Promise<OrganizationIdentity>;
}
