import type { CreateCountZoneCommand, CreateCountZonePort, StockCountZoneRowDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountZonePort } from "../../domain/ports/out/stock-count-zone.port.js";

/** CRUD simples de zonas (secção 5/25/55) — puramente organizacional, sem hierarquia. */
export class CreateCountZoneUseCase implements CreateCountZonePort {
  constructor(private readonly zones: StockCountZonePort) {}

  async execute(command: CreateCountZoneCommand): Promise<StockCountZoneRowDTO> {
    const created = await this.zones.create(command.organizationId, {
      locationId: command.locationId,
      name: command.name,
      ...(command.sortOrder !== undefined && { sortOrder: command.sortOrder }),
    });
    return { id: created.id, locationId: created.locationId, name: created.name, sortOrder: created.sortOrder, isActive: created.isActive };
  }
}
