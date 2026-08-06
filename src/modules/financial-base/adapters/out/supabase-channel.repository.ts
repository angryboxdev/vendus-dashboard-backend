import type { SupabaseClient } from "@supabase/supabase-js";
import { Channel } from "../../domain/entities/channel.js";
import type { ChannelRepositoryPort } from "../../domain/ports/out/channel-repository.port.js";

function toEntity(row: Record<string, unknown>): Channel {
  return Channel.reconstitute({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabaseChannelRepository implements ChannelRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAll(isActive?: boolean): Promise<Channel[]> {
    let query = this.supabase
      .from("channels")
      .select("*")
      .order("sort_order", { ascending: true });

    if (isActive !== undefined) {
      query = query.eq("is_active", isActive);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async findById(id: string): Promise<Channel | null> {
    const { data, error } = await this.supabase
      .from("channels")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }
}
