import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OrganizationProfile } from "../../entities/organization-profile.js";

export interface OrganizationProfileRepositoryPort {
  findById(organizationId: OrganizationId): Promise<OrganizationProfile | null>;
  save(organizationId: OrganizationId, profile: OrganizationProfile): Promise<void>;
}
