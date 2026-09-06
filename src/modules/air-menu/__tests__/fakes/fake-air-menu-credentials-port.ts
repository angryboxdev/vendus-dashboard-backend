import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AirMenuCredentials } from "../../domain/entities/air-menu-credentials.js";
import type { AirMenuCredentialsPort, AirMenuCredentialsResult } from "../../domain/ports/out/air-menu-credentials.port.js";

export class FakeAirMenuCredentialsPort implements AirMenuCredentialsPort {
  private readonly byOrganization = new Map<OrganizationId, AirMenuCredentials>();

  seed(organizationId: OrganizationId, credentials: AirMenuCredentials): void {
    this.byOrganization.set(organizationId, credentials);
  }

  async getByOrganization(organizationId: OrganizationId): Promise<AirMenuCredentialsResult> {
    const credentials = this.byOrganization.get(organizationId);
    return credentials ? { status: "found", credentials } : { status: "not_configured" };
  }
}
