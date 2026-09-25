import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OrganizationIdentityReadPort } from "../../domain/ports/out/organization-identity-read.port.js";

export class FakeOrganizationIdentityRead implements OrganizationIdentityReadPort {
  private nif: string | null = null;

  seedNif(nif: string | null): void {
    this.nif = nif;
  }

  async getNif(_organizationId: OrganizationId): Promise<string | null> {
    return this.nif;
  }
}
