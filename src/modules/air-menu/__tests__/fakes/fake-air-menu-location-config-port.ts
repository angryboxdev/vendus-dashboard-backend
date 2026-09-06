import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AirMenuLocationConfig } from "../../domain/entities/air-menu-location-config.js";
import type {
  AirMenuLocationConfigPort,
  AirMenuLocationConfigResult,
} from "../../domain/ports/out/air-menu-location-config.port.js";

export class FakeAirMenuLocationConfigPort implements AirMenuLocationConfigPort {
  private readonly byKey = new Map<string, AirMenuLocationConfig>();

  seed(organizationId: OrganizationId, locationId: string, config: AirMenuLocationConfig): void {
    this.byKey.set(`${organizationId}:${locationId}`, config);
  }

  async getByLocation(organizationId: OrganizationId, locationId: string): Promise<AirMenuLocationConfigResult> {
    const config = this.byKey.get(`${organizationId}:${locationId}`);
    return config ? { status: "found", config } : { status: "not_configured" };
  }
}
