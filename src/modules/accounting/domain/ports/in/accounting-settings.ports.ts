import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AccountingSettingsDTO } from "../out/accounting-settings-repository.port.js";

export interface GetAccountingSettingsCommand {
  organizationId: OrganizationId;
}

export interface UpdateAccountingSettingsCommand {
  organizationId: OrganizationId;
  vatPeriodicity: string;
}

export interface GetAccountingSettingsPort {
  execute(command: GetAccountingSettingsCommand): Promise<AccountingSettingsDTO>;
}

export interface UpdateAccountingSettingsPort {
  execute(command: UpdateAccountingSettingsCommand): Promise<AccountingSettingsDTO>;
}
