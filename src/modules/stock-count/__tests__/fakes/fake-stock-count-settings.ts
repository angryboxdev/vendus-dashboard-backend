import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CompanyCountSettings, StockCountSettingsPort } from "../../domain/ports/out/stock-count-settings.port.js";

export class FakeStockCountSettings implements StockCountSettingsPort {
  settings: CompanyCountSettings = { defaultTolerance: null, blindCountDefault: true, maxRecounts: null };

  async get(_organizationId: OrganizationId): Promise<CompanyCountSettings> {
    return this.settings;
  }
}
