import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Definições do custo das fichas técnicas por empresa (`menu_costing_settings`, uma linha por empresa). */
export interface MenuCostingSettingsRepositoryPort {
  /** Taxa de IVA das vendas (%); `null` = a empresa ainda não definiu (usa-se a predefinição). */
  getSalesVatRate(organizationId: OrganizationId): Promise<number | null>;
  setSalesVatRate(organizationId: OrganizationId, rate: number, actor: string): Promise<void>;
}
