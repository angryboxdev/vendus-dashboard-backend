import type { Channel } from "../../entities/channel.js";

export interface ChannelRepositoryPort {
  findAll(isActive?: boolean): Promise<Channel[]>;
  findById(id: string): Promise<Channel | null>;
}
