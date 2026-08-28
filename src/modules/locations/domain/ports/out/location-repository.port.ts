import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Location } from "../../entities/location.js";

export interface LocationRepositoryPort {
  findAllForOrganization(organizationId: OrganizationId): Promise<Location[]>;
}
