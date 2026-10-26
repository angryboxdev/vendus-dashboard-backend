import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Definições do Stock da empresa (`stock_settings`, uma linha por empresa). */
export interface StockSettingsRepositoryPort {
  /** Localização principal das entradas de faturas; `null` = não configurada. */
  getDefaultLocationId(organizationId: OrganizationId): Promise<string | null>;
  setDefaultLocationId(organizationId: OrganizationId, locationId: string | null, actor: string): Promise<void>;
}
