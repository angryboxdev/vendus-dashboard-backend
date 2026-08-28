import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface LocationDto {
  id: string;
  name: string;
  code: string;
  timezone: string;
  isActive: boolean;
}

export interface ListLocationsInput {
  organizationId: OrganizationId;
}

export interface ListLocationsPort {
  execute(input: ListLocationsInput): Promise<LocationDto[]>;
}
