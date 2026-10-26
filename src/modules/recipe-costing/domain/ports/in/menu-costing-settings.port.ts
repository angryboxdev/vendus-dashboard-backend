import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface MenuCostingSettingsDTO {
  /** Taxa de IVA das vendas (%) usada para a margem dos pratos. */
  salesVatRate: number;
  /** `true` quando a empresa ainda não definiu e vale a predefinição. */
  isDefault: boolean;
}

export interface GetMenuCostingSettingsPort {
  execute(command: { organizationId: OrganizationId }): Promise<MenuCostingSettingsDTO>;
}

export interface SaveMenuCostingSettingsPort {
  execute(command: { organizationId: OrganizationId; actor: string; salesVatRate: number }): Promise<MenuCostingSettingsDTO>;
}

export class InvalidMenuCostingSettingsError extends Error {}
