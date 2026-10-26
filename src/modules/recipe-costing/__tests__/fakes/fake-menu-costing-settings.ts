import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { MenuCostingSettingsRepositoryPort } from "../../domain/ports/out/menu-costing-settings.port.js";

export class FakeMenuCostingSettings implements MenuCostingSettingsRepositoryPort {
  rate: number | null = null;
  saved: { organizationId: OrganizationId; rate: number; actor: string }[] = [];

  async getSalesVatRate(): Promise<number | null> {
    return this.rate;
  }

  async setSalesVatRate(organizationId: OrganizationId, rate: number, actor: string): Promise<void> {
    this.rate = rate;
    this.saved.push({ organizationId, rate, actor });
  }
}
