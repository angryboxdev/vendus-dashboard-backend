import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
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

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseChannelRepository implements ChannelRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAll(organizationId: OrganizationId, isActive?: boolean): Promise<Channel[]> {
    let query = this.scopedQuery(organizationId)
      .table("channels")
      .select("*")
      .order("sort_order", { ascending: true });

    if (isActive !== undefined) {
      query = query.eq("is_active", isActive);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Channel | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("channels")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }
}
