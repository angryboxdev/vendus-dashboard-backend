import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockSettingsRepositoryPort } from "../../domain/ports/out/stock-settings-repository.port.js";

export class FakeStockSettingsRepository implements StockSettingsRepositoryPort {
  readonly byOrg = new Map<string, string | null>();

  async getDefaultLocationId(organizationId: OrganizationId): Promise<string | null> {
    return this.byOrg.get(organizationId) ?? null;
  }

  async setDefaultLocationId(organizationId: OrganizationId, locationId: string | null): Promise<void> {
    this.byOrg.set(organizationId, locationId);
  }
}
