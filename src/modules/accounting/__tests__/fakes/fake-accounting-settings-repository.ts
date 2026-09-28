import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AccountingSettingsDTO, AccountingSettingsRepositoryPort } from "../../domain/ports/out/accounting-settings-repository.port.js";

export class FakeAccountingSettingsRepository implements AccountingSettingsRepositoryPort {
  private readonly settings = new Map<string, AccountingSettingsDTO>();

  async get(organizationId: OrganizationId): Promise<AccountingSettingsDTO> {
    return this.settings.get(organizationId) ?? { vatPeriodicity: "quarterly" };
  }

  async save(organizationId: OrganizationId, settings: AccountingSettingsDTO): Promise<void> {
    this.settings.set(organizationId, settings);
  }
}
