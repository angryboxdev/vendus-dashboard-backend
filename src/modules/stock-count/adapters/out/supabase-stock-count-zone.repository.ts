import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { CreateStockCountZoneData, StockCountZoneDTO, StockCountZonePort } from "../../domain/ports/out/stock-count-zone.port.js";

interface Row {
  id: string;
  location_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

function rowToDto(row: Row): StockCountZoneDTO {
  return { id: row.id, locationId: row.location_id, name: row.name, sortOrder: Number(row.sort_order), isActive: Boolean(row.is_active) };
}

export class SupabaseStockCountZoneRepository implements StockCountZonePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listByLocation(organizationId: OrganizationId, locationId: string): Promise<StockCountZoneDTO[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_count_zones")
      .select("id, location_id, name, sort_order, is_active")
      .eq("location_id", locationId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDto);
  }

  async create(organizationId: OrganizationId, data: CreateStockCountZoneData): Promise<StockCountZoneDTO> {
    const row = {
      id: randomUUID(),
      location_id: data.locationId,
      name: data.name.trim(),
      sort_order: data.sortOrder ?? 0,
      is_active: true,
    };
    const { data: created, error } = await this.scopedQuery(organizationId)
      .table("stock_count_zones")
      .insert(row)
      .select("id, location_id, name, sort_order, is_active")
      .single();
    if (error) throw new Error(error.message);
    return rowToDto(created as unknown as Row);
  }
}
