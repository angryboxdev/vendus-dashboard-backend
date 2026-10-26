import {
  InvalidMenuCostingSettingsError,
  type GetMenuCostingSettingsPort,
  type MenuCostingSettingsDTO,
  type SaveMenuCostingSettingsPort,
} from "../../domain/ports/in/menu-costing-settings.port.js";
import type { MenuCostingSettingsRepositoryPort } from "../../domain/ports/out/menu-costing-settings.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { DEFAULT_SALES_VAT_RATE } from "../../domain/services/dish-margin.service.js";

/** Taxa de IVA das vendas da empresa, ou a predefinição quando ainda não foi definida. */
export async function resolveSalesVatRate(repo: MenuCostingSettingsRepositoryPort, organizationId: OrganizationId): Promise<MenuCostingSettingsDTO> {
  const rate = await repo.getSalesVatRate(organizationId);
  return rate == null ? { salesVatRate: DEFAULT_SALES_VAT_RATE, isDefault: true } : { salesVatRate: rate, isDefault: false };
}

export class GetMenuCostingSettingsUseCase implements GetMenuCostingSettingsPort {
  constructor(private readonly repo: MenuCostingSettingsRepositoryPort) {}

  execute(command: { organizationId: OrganizationId }): Promise<MenuCostingSettingsDTO> {
    return resolveSalesVatRate(this.repo, command.organizationId);
  }
}

export class SaveMenuCostingSettingsUseCase implements SaveMenuCostingSettingsPort {
  constructor(private readonly repo: MenuCostingSettingsRepositoryPort) {}

  async execute(command: { organizationId: OrganizationId; actor: string; salesVatRate: number }): Promise<MenuCostingSettingsDTO> {
    const rate = command.salesVatRate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new InvalidMenuCostingSettingsError("A taxa de IVA das vendas tem de estar entre 0 e 100%.");
    }
    const rounded = Math.round(rate * 100) / 100;
    await this.repo.setSalesVatRate(command.organizationId, rounded, command.actor);
    return { salesVatRate: rounded, isDefault: false };
  }
}
