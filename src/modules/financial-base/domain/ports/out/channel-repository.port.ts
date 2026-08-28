import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Channel } from "../../entities/channel.js";

export interface ChannelRepositoryPort {
  findAll(organizationId: OrganizationId, isActive?: boolean): Promise<Channel[]>;
  findById(organizationId: OrganizationId, id: string): Promise<Channel | null>;
}
