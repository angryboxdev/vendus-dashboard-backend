import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CreateStockCountZoneData, StockCountZoneDTO, StockCountZonePort } from "../../domain/ports/out/stock-count-zone.port.js";

export class FakeStockCountZone implements StockCountZonePort {
  zones = new Map<string, StockCountZoneDTO>();

  async listByLocation(_organizationId: OrganizationId, locationId: string): Promise<StockCountZoneDTO[]> {
    return [...this.zones.values()].filter((z) => z.locationId === locationId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async create(_organizationId: OrganizationId, data: CreateStockCountZoneData): Promise<StockCountZoneDTO> {
    const zone: StockCountZoneDTO = {
      id: randomUUID(),
      locationId: data.locationId,
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
    };
    this.zones.set(zone.id, zone);
    return zone;
  }
}
