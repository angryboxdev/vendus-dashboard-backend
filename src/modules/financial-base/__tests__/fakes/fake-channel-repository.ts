import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Channel } from "../../domain/entities/channel.js";
import type { ChannelRepositoryPort } from "../../domain/ports/out/channel-repository.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeChannelRepository implements ChannelRepositoryPort {
  private store = new Map<string, Channel>();

  async findAll(_organizationId: OrganizationId, isActive?: boolean): Promise<Channel[]> {
    let results = [...this.store.values()];
    if (isActive !== undefined) {
      results = results.filter((c) => c.isActive === isActive);
    }
    return results.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<Channel | null> {
    return this.store.get(id) ?? null;
  }

  seed(channel: Channel): void {
    this.store.set(channel.id, channel);
  }
}
