import type { OrganizationIdentity } from "../../entities/organization-identity.js";

export interface OrganizationIdentityPort {
  findById(orgId: string): Promise<OrganizationIdentity | null>;
}
