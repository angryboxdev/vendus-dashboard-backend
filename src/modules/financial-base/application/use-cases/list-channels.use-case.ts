import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ListChannelsPort, ChannelDTO } from "../../domain/ports/in/channel.ports.js";
import type { ChannelRepositoryPort } from "../../domain/ports/out/channel-repository.port.js";

export class ListChannelsUseCase implements ListChannelsPort {
  constructor(private readonly repo: ChannelRepositoryPort) {}

  async execute(organizationId: OrganizationId, isActive?: boolean): Promise<ChannelDTO[]> {
    const channels = await this.repo.findAll(organizationId, isActive);
    return channels.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    }));
  }
}
