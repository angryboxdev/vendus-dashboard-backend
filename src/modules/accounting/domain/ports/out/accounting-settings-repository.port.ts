import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { VatPeriodicity } from "../../services/vat-period.service.js";

export interface AccountingSettingsDTO {
  vatPeriodicity: VatPeriodicity;
}

/** 1 linha por organização; ausência de linha = "quarterly" por omissão. */
export interface AccountingSettingsRepositoryPort {
  get(organizationId: OrganizationId): Promise<AccountingSettingsDTO>;
  save(organizationId: OrganizationId, settings: AccountingSettingsDTO): Promise<void>;
}
