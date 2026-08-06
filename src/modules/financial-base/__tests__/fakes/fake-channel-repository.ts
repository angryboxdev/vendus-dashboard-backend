import type { Channel } from "../../domain/entities/channel.js";
import type { ChannelRepositoryPort } from "../../domain/ports/out/channel-repository.port.js";

export class FakeChannelRepository implements ChannelRepositoryPort {
  private store = new Map<string, Channel>();

  async findAll(isActive?: boolean): Promise<Channel[]> {
    let results = [...this.store.values()];
    if (isActive !== undefined) {
      results = results.filter((c) => c.isActive === isActive);
    }
    return results.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findById(id: string): Promise<Channel | null> {
    return this.store.get(id) ?? null;
  }

  seed(channel: Channel): void {
    this.store.set(channel.id, channel);
  }
}
