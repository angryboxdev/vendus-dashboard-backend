import type { ListCountZonesCommand, ListCountZonesPort, StockCountZoneRowDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountZonePort } from "../../domain/ports/out/stock-count-zone.port.js";

export class ListCountZonesUseCase implements ListCountZonesPort {
  constructor(private readonly zones: StockCountZonePort) {}

  async execute(command: ListCountZonesCommand): Promise<StockCountZoneRowDTO[]> {
    const zones = await this.zones.listByLocation(command.organizationId, command.locationId);
    return zones.map((z) => ({ id: z.id, locationId: z.locationId, name: z.name, sortOrder: z.sortOrder, isActive: z.isActive }));
  }
}
