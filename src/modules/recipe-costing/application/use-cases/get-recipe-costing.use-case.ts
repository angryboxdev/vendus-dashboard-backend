import type { RecipeCostingReport } from "../../domain/entities/recipe-costing.js";
import type { GetRecipeCostingCommand, GetRecipeCostingPort } from "../../domain/ports/in/get-recipe-costing.port.js";
import type { RecipeCostingReadPort } from "../../domain/ports/out/recipe-costing-read.port.js";
import { computeRecipeCosting } from "../../domain/services/recipe-cost.service.js";
import type { MenuCostingSettingsRepositoryPort } from "../../domain/ports/out/menu-costing-settings.port.js";
import { resolveSalesVatRate } from "./menu-costing-settings.use-cases.js";

export class GetRecipeCostingUseCase implements GetRecipeCostingPort {
  constructor(
    private readonly reader: RecipeCostingReadPort,
    private readonly settings: MenuCostingSettingsRepositoryPort,
  ) {}

  async execute(command: GetRecipeCostingCommand): Promise<RecipeCostingReport> {
    const [snapshot, settings] = await Promise.all([this.reader.loadSnapshot(command.organizationId), resolveSalesVatRate(this.settings, command.organizationId)]);
    return computeRecipeCosting(snapshot, settings.salesVatRate);
  }
}
