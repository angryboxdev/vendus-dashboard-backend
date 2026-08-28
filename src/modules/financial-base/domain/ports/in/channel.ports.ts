import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface ChannelDTO {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ListChannelsPort {
  execute(organizationId: OrganizationId, isActive?: boolean): Promise<ChannelDTO[]>;
}
