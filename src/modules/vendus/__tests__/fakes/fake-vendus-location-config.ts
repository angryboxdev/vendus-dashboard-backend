import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  VendusLocationConfigPort,
  VendusLocationConfigResult,
} from "../../domain/ports/out/vendus-location-config.port.js";
import type { VendusLocationConfig } from "../../domain/entities/vendus-location-config.js";

function key(organizationId: OrganizationId, locationId: string): string {
  return `${organizationId}:${locationId}`;
}

export class FakeVendusLocationConfig implements VendusLocationConfigPort {
  private rows = new Map<string, VendusLocationConfig>();

  seed(organizationId: OrganizationId, locationId: string, config: VendusLocationConfig): void {
    this.rows.set(key(organizationId, locationId), config);
  }

  async getByOrganizationAndLocation(
    organizationId: OrganizationId,
    locationId: string,
  ): Promise<VendusLocationConfigResult> {
    const config = this.rows.get(key(organizationId, locationId));
    return config ? { status: "configured", config } : { status: "not_configured" };
  }

  async save(organizationId: OrganizationId, locationId: string, config: VendusLocationConfig): Promise<void> {
    this.rows.set(key(organizationId, locationId), config);
  }
}
