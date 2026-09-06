import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  VendusCredentialsPort,
  VendusCredentialsResult,
} from "../../domain/ports/out/vendus-credentials.port.js";
import type { VendusCredentials } from "../../domain/entities/vendus-credentials.js";

export class FakeVendusCredentials implements VendusCredentialsPort {
  private rows = new Map<OrganizationId, VendusCredentials>();

  seed(organizationId: OrganizationId, credentials: VendusCredentials): void {
    this.rows.set(organizationId, credentials);
  }

  async getByOrganization(organizationId: OrganizationId): Promise<VendusCredentialsResult> {
    const credentials = this.rows.get(organizationId);
    return credentials ? { status: "configured", credentials } : { status: "not_configured" };
  }

  async save(organizationId: OrganizationId, credentials: VendusCredentials): Promise<void> {
    this.rows.set(organizationId, credentials);
  }
}
